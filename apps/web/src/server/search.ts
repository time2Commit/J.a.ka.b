import { Prisma, type PrismaClient } from "@jakab/db";
import { foldForSearch, jsonToPlainText } from "@jakab/editor/plain-text";
import { escapeLike, suggestProjects, type ProjectSuggestion } from "./suggest";
import { parseDefaults } from "./templates";

/** Notes are searched from this many characters of the query. */
const MIN_NOTE_QUERY = 2;
const NOTE_HIT_LIMIT = 10;
const REINDEX_BATCH = 200;
const SNIPPET_BEFORE = 50;
const SNIPPET_AFTER = 90;

export interface NoteHit {
  id: string;
  name: string;
  folderId: string | null;
  statusId: string;
  /** The text around the first match, cut in three so that the match can be highlighted. */
  snippet: { before: string; match: string; after: string };
}

export interface TemplateHit {
  id: string;
  name: string;
  folderId: string | null;
  /** Set when the words were found in the template's text rather than in its name. */
  snippet: NoteHit["snippet"] | null;
}

export interface SearchResults {
  /** Projects whose name matches. */
  projects: ProjectSuggestion[];
  /** Other projects whose note contains the words. */
  notes: NoteHit[];
  /** Templates whose name or text contains the words. */
  templates: TemplateHit[];
}

const TEMPLATE_HIT_LIMIT = 6;

/**
 * Templates are few, so they are matched here instead of in the database: every word must be in
 * the name, the checklist or the note text. Name matches come first.
 */
export async function searchTemplates(db: PrismaClient, terms: string[]): Promise<TemplateHit[]> {
  if (terms.length === 0) return [];
  const templates = await db.template.findMany({
    select: { id: true, name: true, folderId: true, defaults: true, noteJson: true },
    orderBy: { name: "asc" },
  });
  const hits: (TemplateHit & { byName: boolean })[] = [];
  for (const t of templates) {
    const foldedName = foldForSearch(t.name);
    const byName = terms.every((term) => foldedName.includes(term));
    const checklist = (parseDefaults(t.defaults).checklist ?? []).join("\n");
    const text = [jsonToPlainText(t.noteJson), checklist].filter(Boolean).join("\n");
    const folded = foldForSearch(text);
    const inText = terms.every((term) => foldedName.includes(term) || folded.includes(term));
    if (!byName && !inText) continue;
    hits.push({
      id: t.id,
      name: t.name,
      folderId: t.folderId,
      snippet: byName ? null : snippetOf(text, folded, terms),
      byName,
    });
  }
  hits.sort((a, b) => Number(b.byName) - Number(a.byName));
  return hits
    .slice(0, TEMPLATE_HIT_LIMIT)
    .map(({ id, name, folderId, snippet }) => ({ id, name, folderId, snippet }));
}

/** Brings the searchable text of every note that changed since it was last read up to date. */
export async function reindexNotes(db: PrismaClient) {
  for (;;) {
    const stale = await db.$queryRaw<{ projectId: string; json: unknown; updatedAt: Date }[]>`
      SELECT "projectId", json, "updatedAt"
      FROM note_document
      WHERE "searchIndexedAt" IS DISTINCT FROM "updatedAt"
      LIMIT ${REINDEX_BATCH}`;
    if (stale.length === 0) return;
    for (const note of stale) {
      const text = jsonToPlainText(note.json);
      // `updatedAt` is written back as it was: indexing is not a change to the note. If the
      // note changed meanwhile, the stored `updatedAt` differs and it is indexed again later.
      await db.$executeRaw`
        UPDATE note_document
        SET "searchText" = ${text}, "searchFolded" = ${foldForSearch(text)},
            "searchIndexedAt" = ${note.updatedAt}
        WHERE "projectId" = ${note.projectId} AND "updatedAt" = ${note.updatedAt}`;
    }
    // A note that keeps changing between the read and the write would loop forever.
    if (stale.length < REINDEX_BATCH) return;
  }
}

/** The words of a query, folded: a note matches when it contains all of them. */
export function searchTerms(query: string): string[] {
  return [...new Set(foldForSearch(query).split(/\s+/).filter(Boolean))].slice(0, 6);
}

/** A short excerpt around the first of the words found in `text`. */
export function snippetOf(text: string, folded: string, terms: string[]): NoteHit["snippet"] {
  let at = -1;
  let length = 0;
  for (const term of terms) {
    const index = folded.indexOf(term);
    if (index >= 0 && (at < 0 || index < at)) {
      at = index;
      length = term.length;
    }
  }
  if (at < 0) return { before: "", match: "", after: text.slice(0, SNIPPET_AFTER).trim() };
  const flat = (value: string) => value.replace(/\s+/g, " ");
  const start = Math.max(0, at - SNIPPET_BEFORE);
  const end = Math.min(text.length, at + length + SNIPPET_AFTER);
  return {
    before: (start > 0 ? "…" : "") + flat(text.slice(start, at)).trimStart(),
    match: flat(text.slice(at, at + length)),
    after: flat(text.slice(at + length, end)).trimEnd() + (end < text.length ? "…" : ""),
  };
}

/**
 * Search for the box in the header: projects by name first (typos tolerated), then the other
 * projects whose note contains every word of the query (accents and capitals do not matter).
 */
export async function searchEverything(db: PrismaClient, query: string): Promise<SearchResults> {
  const q = query.trim().slice(0, 120);
  const projects = await suggestProjects(db, q);
  const terms = searchTerms(q);
  const templates = await searchTemplates(db, terms);
  if (q.length < MIN_NOTE_QUERY || terms.length === 0) return { projects, notes: [], templates };

  await reindexNotes(db);
  const conditions = terms.map((t) => Prisma.sql`nd."searchFolded" LIKE ${`%${escapeLike(t)}%`}`);
  const rows = await db.$queryRaw<
    {
      id: string;
      name: string;
      folderId: string | null;
      statusId: string;
      text: string;
      folded: string;
    }[]
  >(Prisma.sql`
    SELECT p.id, p.name, p."folderId", p."statusId",
           nd."searchText" AS text, nd."searchFolded" AS folded
    FROM note_document nd
    JOIN project p ON p.id = nd."projectId"
    WHERE p."archivedAt" IS NULL
      AND ${Prisma.join(conditions, " AND ")}
      ${
        projects.length > 0
          ? Prisma.sql`AND p.id NOT IN (${Prisma.join(projects.map((p) => p.id))})`
          : Prisma.empty
      }
    ORDER BY nd."updatedAt" DESC
    LIMIT ${NOTE_HIT_LIMIT}`);

  return {
    projects,
    templates,
    notes: rows.map(({ text, folded, ...project }) => ({
      ...project,
      snippet: snippetOf(text, folded, terms),
    })),
  };
}
