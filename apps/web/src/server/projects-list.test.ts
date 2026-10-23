import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@jakab/db";
import { listProjects } from "./projects-list";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const name = (n: string) => `${n} ${run}`;
let statusId: string;
const projectIds: string[] = [];

const at = (iso: string) => new Date(iso);

async function project(label: string, createdAt: string, noteAt?: string) {
  const p = await prisma.project.create({
    data: {
      name: name(label),
      nameNormalized: name(label).toLowerCase(),
      statusId,
      createdById: "u",
      createdAt: at(createdAt),
      ...(noteAt && { note: { create: { json: {}, updatedAt: at(noteAt) } } }),
    },
  });
  projectIds.push(p.id);
  return p;
}

const card = (projectId: string, end: string, updatedAt: string) =>
  prisma.card.create({
    data: {
      projectId,
      statusId,
      start: at("2026-02-01T09:00:00Z"),
      end: at(end),
      createdById: "u",
      updatedAt: at(updatedAt),
    },
  });

beforeAll(async () => {
  statusId = (
    await prisma.status.create({ data: { name: name("List"), color: "#123456", order: 94 } })
  ).id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.$disconnect();
});

describe("listProjects", () => {
  it("reports the last card end and the latest change among creation, note and cards", async () => {
    const busy = await project("Busy", "2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z");
    await card(busy.id, "2026-02-10T10:00:00Z", "2026-01-08T00:00:00Z");
    await card(busy.id, "2026-03-15T10:00:00Z", "2026-01-03T00:00:00Z");

    const quiet = await project("Quiet", "2026-01-02T00:00:00Z");
    const noted = await project("Noted", "2026-01-02T00:00:00Z", "2026-01-20T00:00:00Z");
    const alone = await project("Alone", "2026-01-10T00:00:00Z");
    await card(alone.id, "2026-02-01T10:00:00Z", "2026-01-04T00:00:00Z");

    const list = await listProjects(prisma);
    const of = (id: string) => list.find((p) => p.id === id)!;

    expect(of(busy.id).lastCardEnd).toBe("2026-03-15T10:00:00.000Z");
    expect(of(busy.id).lastModified).toBe("2026-01-08T00:00:00.000Z");

    expect(of(quiet.id).lastCardEnd).toBeNull();
    expect(of(quiet.id).lastModified).toBe("2026-01-02T00:00:00.000Z");

    expect(of(noted.id).lastModified).toBe("2026-01-20T00:00:00.000Z");

    // Creation counts too: this card was touched before the project was created.
    expect(of(alone.id).lastModified).toBe("2026-01-10T00:00:00.000Z");
    expect(of(alone.id).lastCardEnd).toBe("2026-02-01T10:00:00.000Z");
  });

  it("leaves archived projects out", async () => {
    const archived = await project("Archived", "2026-01-01T00:00:00Z");
    await prisma.project.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    expect((await listProjects(prisma)).some((p) => p.id === archived.id)).toBe(false);
  });
});
