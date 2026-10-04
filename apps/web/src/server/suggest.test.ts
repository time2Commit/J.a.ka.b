import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@jakab/db";
import { normalizeProjectName } from "@jakab/shared";
import { escapeLike, listUnscheduled, suggestProjects } from "./suggest";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
// A unique token keeps these projects apart from any other data in the database.
const tag = `zq${run}`;
const now = new Date("2026-10-05T12:00:00Z");
const day = (d: number) => new Date(now.getTime() + d * 864e5);

let statusId: string;
let doneStatusId: string;
const names = {
  prefix: `${tag} Cliente Acme`,
  contains: `Progetto ${tag} Acme`,
  typo: `${tag} Fornitore`,
  accent: `${tag} Città Alta`,
  past: `${tag} Archivio Vecchio`,
  done: `${tag} Completato`,
  archived: `${tag} Archiviato`,
};
const ids: Record<string, string> = {};

beforeAll(async () => {
  const todo = await prisma.status.create({
    data: { name: `S ${run}`, color: "#111111", order: 90 },
  });
  const done = await prisma.status.create({
    data: { name: `D ${run}`, color: "#222222", order: 91, isDone: true },
  });
  statusId = todo.id;
  doneStatusId = done.id;
  for (const [key, name] of Object.entries(names)) {
    const project = await prisma.project.create({
      data: {
        name,
        nameNormalized: normalizeProjectName(name),
        statusId: key === "done" ? doneStatusId : statusId,
        createdById: "u",
        archivedAt: key === "archived" ? now : null,
      },
    });
    ids[key] = project.id;
  }
  const card = (projectId: string, start: Date, end: Date) =>
    prisma.card.create({ data: { projectId, start, end, createdById: "u" } });
  await card(ids.prefix!, day(-3), day(-3)); // past
  await card(ids.prefix!, day(2), day(2)); // upcoming
  await card(ids.contains!, day(-1), day(-1)); // past only
  await card(ids.past!, day(-10), day(-10));
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: Object.values(ids) } } });
  await prisma.status.deleteMany({ where: { id: { in: [statusId, doneStatusId] } } });
  await prisma.$disconnect();
});

describe("suggestProjects", () => {
  it("ranks prefix matches before contains matches", async () => {
    const result = await suggestProjects(prisma, `${tag}`, now);
    const order = result.map((r) => r.name);
    expect(order.indexOf(names.prefix)).toBeLessThan(order.indexOf(names.contains));
    expect(order).toContain(names.contains);
  });

  it("ignores case, accents and extra whitespace", async () => {
    const result = await suggestProjects(prisma, `  ${tag.toUpperCase()}   citta `, now);
    expect(result.map((r) => r.name)).toContain(names.accent);
  });

  it("finds near matches with a typo through trigram similarity", async () => {
    const result = await suggestProjects(prisma, `${tag} Fornitorre`, now);
    expect(result.map((r) => r.name)).toContain(names.typo);
  });

  it("never suggests archived projects and treats wildcards literally", async () => {
    const result = await suggestProjects(prisma, `${tag}`, now);
    expect(result.map((r) => r.name)).not.toContain(names.archived);
    expect(await suggestProjects(prisma, "%", now)).toHaveLength(0);
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("returns at most 8 results and, for an empty query, recent projects", async () => {
    expect((await suggestProjects(prisma, "", now)).length).toBeLessThanOrEqual(8);
    expect((await suggestProjects(prisma, "a", now)).length).toBeLessThanOrEqual(8);
  });

  it("points at the next upcoming card, else the most recent one", async () => {
    const result = await suggestProjects(prisma, `${tag}`, now);
    const prefix = result.find((r) => r.name === names.prefix)!;
    expect(prefix.focusCard?.start).toBe(day(2).toISOString());
    expect(prefix.lastCardEnd).toBe(day(2).toISOString());
    const contains = result.find((r) => r.name === names.contains)!;
    expect(contains.focusCard?.start).toBe(day(-1).toISOString());
    expect(result.find((r) => r.name === names.typo)?.focusCard).toBeNull();
  });
});

describe("listUnscheduled", () => {
  it("lists projects without future cards, skipping done and archived ones", async () => {
    const result = (await listUnscheduled(prisma, now)).filter((p) => p.name.includes(tag));
    const found = result.map((p) => p.name).sort();
    expect(found).toEqual([names.accent, names.contains, names.past, names.typo].sort());
    expect(result.find((p) => p.name === names.past)?.lastCardEnd).toBe(day(-10).toISOString());
  });
});
