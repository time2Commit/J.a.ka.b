import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@jakab/db";
import { reindexNotes, searchEverything, searchTerms, snippetOf } from "./search";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
let statusId: string;
const projectIds: string[] = [];

const note = (...paragraphs: string[]) => ({
  type: "doc",
  content: paragraphs.map((t) => ({ type: "paragraph", content: [{ type: "text", text: t }] })),
});

/**
 * The names carry their own random suffix, not `run`: the searched words contain `run`, and a
 * name that shares it would be found by name (which the note search leaves out) instead.
 */
async function project(label: string, json: object | null, archived = false) {
  const name = label.includes("$")
    ? label.replace("$", "")
    : `${label} ${randomUUID().slice(0, 8)}`;
  const p = await prisma.project.create({
    data: {
      name,
      nameNormalized: name.toLowerCase(),
      statusId,
      archivedAt: archived ? new Date() : null,
      createdById: "u",
      ...(json && { note: { create: { json } } }),
    },
  });
  projectIds.push(p.id);
  return p;
}

beforeAll(async () => {
  statusId = (
    await prisma.status.create({ data: { name: `Search ${run}`, color: "#123456", order: 94 } })
  ).id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.$disconnect();
});

describe("snippetOf", () => {
  it("cuts the text around the first word found and marks what was cut", () => {
    const text = `${"a ".repeat(60)}needle ${"b ".repeat(80)}`;
    const snippet = snippetOf(text, text.toLowerCase(), ["needle"]);
    expect(snippet.match).toBe("needle");
    expect(snippet.before.startsWith("…")).toBe(true);
    expect(snippet.after.endsWith("…")).toBe(true);
    expect(snippet.before.length).toBeLessThan(70);
  });

  it("keeps the original capitals and accents", () => {
    const text = "Una Perché importante";
    const snippet = snippetOf(text, "una perche importante", ["perche"]);
    expect(snippet).toEqual({ before: "Una ", match: "Perché", after: " importante" });
  });
});

describe("searchTerms", () => {
  it("folds, splits and drops duplicates", () => {
    expect(searchTerms("  Perché  PERCHE Roma ")).toEqual(["perche", "roma"]);
  });
});

describe("searching inside notes", () => {
  it("finds a note by words in its text, ignoring capitals and accents", async () => {
    const p = await project("Budget", note("Intro", `Il fornitore ${run} è già stato contattato`));
    const hits = await searchEverything(prisma, `FORNITORE gia ${run}`);
    const hit = hits.notes.find((n) => n.id === p.id);
    expect(hit).toBeDefined();
    expect(hit!.snippet.match.toLowerCase()).toBe("fornitore");
    expect(hit!.snippet.after).toContain(run);
    // A word that is not in the note does not match.
    expect((await searchEverything(prisma, `fornitore assente-${run}`)).notes).toEqual([]);
  });

  it("needs every word, wherever they are in the note", async () => {
    const p = await project("Words", note(`alpha${run}`, "somewhere else", `omega${run}`));
    const both = await searchEverything(prisma, `alpha${run} omega${run}`);
    expect(both.notes.map((n) => n.id)).toContain(p.id);
  });

  it("lists a project once: by name, not again as a note hit", async () => {
    const p = await project(`$Lighthouse${run}`, note(`Lighthouse${run} is mentioned here`));
    const results = await searchEverything(prisma, `lighthouse${run}`);
    expect(results.projects.map((x) => x.id)).toContain(p.id);
    expect(results.notes.map((n) => n.id)).not.toContain(p.id);
  });

  it("skips archived projects and very short queries", async () => {
    const p = await project("Archived", note(`hidden${run}`), true);
    expect((await searchEverything(prisma, `hidden${run}`)).notes.map((n) => n.id)).not.toContain(
      p.id,
    );
    expect((await searchEverything(prisma, "x")).notes).toEqual([]);
  });

  it("treats % and _ as plain characters", async () => {
    const p = await project("Wild", note(`100% sure_${run}`));
    expect((await searchEverything(prisma, `100% sure_${run}`)).notes.map((n) => n.id)).toContain(
      p.id,
    );
    expect((await searchEverything(prisma, "%%")).notes).toEqual([]);
  });
});

describe("reindexNotes", () => {
  it("indexes without touching the note's modification date, and again after an edit", async () => {
    const p = await project("Index", note(`first${run}`));
    const before = await prisma.noteDocument.findUniqueOrThrow({ where: { projectId: p.id } });
    expect(before.searchIndexedAt).toBeNull();

    await reindexNotes(prisma);
    const indexed = await prisma.noteDocument.findUniqueOrThrow({ where: { projectId: p.id } });
    expect(indexed.searchText).toBe(`first${run}`);
    expect(indexed.searchIndexedAt?.getTime()).toBe(before.updatedAt.getTime());
    expect(indexed.updatedAt.getTime()).toBe(before.updatedAt.getTime());

    await new Promise((resolve) => setTimeout(resolve, 5));
    await prisma.noteDocument.update({
      where: { projectId: p.id },
      data: { json: note(`second${run}`) },
    });
    expect((await searchEverything(prisma, `second${run}`)).notes.map((n) => n.id)).toContain(p.id);
    expect((await searchEverything(prisma, `first${run}`)).notes.map((n) => n.id)).not.toContain(
      p.id,
    );
  });

  it("copes with projects that have no note content", async () => {
    await project("Empty", null);
    const p = await project("Blank", { type: "doc" });
    await reindexNotes(prisma);
    const row = await prisma.noteDocument.findUniqueOrThrow({ where: { projectId: p.id } });
    expect(row.searchText).toBe("");
  });
});
