import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "./index";

const prisma = createPrismaClient();

afterAll(() => prisma.$disconnect());

describe("database", () => {
  it("has the pg_trgm extension and the trigram index on project names", async () => {
    const ext = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'pg_trgm'`;
    expect(ext).toHaveLength(1);
    const idx = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE indexname = 'project_nameNormalized_trgm_idx'`;
    expect(idx).toHaveLength(1);
  });

  it("has a partial index on the notes whose search text is out of date, and the lookup can use it", async () => {
    const idx = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE indexname = 'note_document_unindexed_idx'`;
    expect(idx).toHaveLength(1);
    expect(idx[0]!.indexdef).toContain("IS DISTINCT FROM");

    // With a table this small the planner would scan it anyway: forbid that to see the choice.
    const plan = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL enable_seqscan = off`;
      return tx.$queryRaw<{ "QUERY PLAN": string }[]>`
        EXPLAIN SELECT "projectId" FROM note_document
        WHERE "searchIndexedAt" IS DISTINCT FROM "updatedAt" LIMIT 200`;
    });
    expect(plan.map((row) => row["QUERY PLAN"]).join("\n")).toContain(
      "note_document_unindexed_idx",
    );
  });

  it("enforces unique project names", async () => {
    const status = await prisma.status.create({
      data: { name: `test-${Date.now()}`, color: "#000000", order: 99 },
    });
    const name = `Project ${Date.now()}`;
    const base = {
      name,
      nameNormalized: name.toLowerCase(),
      statusId: status.id,
      createdById: "u",
    };
    const project = await prisma.project.create({ data: base });
    await expect(prisma.project.create({ data: base })).rejects.toThrow();
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.status.delete({ where: { id: status.id } });
  });
});
