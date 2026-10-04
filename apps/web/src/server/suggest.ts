import { Prisma, type PrismaClient } from "@jakab/db";
import { normalizeProjectName } from "@jakab/shared";

export const SUGGESTION_LIMIT = 8;

export interface ProjectSuggestion {
  id: string;
  name: string;
  statusId: string;
  progress: number;
  /** End of the last scheduled card, if any. */
  lastCardEnd: string | null;
  /** Card to jump to: the next upcoming one, else the most recent one. */
  focusCard: { id: string; start: string } | null;
}

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

interface Row {
  id: string;
  name: string;
  statusId: string;
  progress: number;
}

/**
 * Project name suggestions. Ranking: names starting with the query first, then names
 * containing it, then trigram-similar names (similarity > 0.3, typo tolerant).
 * An empty query returns the most recently scheduled projects.
 */
export async function suggestProjects(
  db: PrismaClient,
  query: string,
  now = new Date(),
): Promise<ProjectSuggestion[]> {
  const q = normalizeProjectName(query);
  let rows: Row[];

  if (q === "") {
    rows = await db.$queryRaw<Row[]>`
      SELECT p.id, p.name, p."statusId", p.progress
      FROM project p
      LEFT JOIN card c ON c."projectId" = p.id
      WHERE p."archivedAt" IS NULL
      GROUP BY p.id
      ORDER BY max(c."end") DESC NULLS LAST, p.name
      LIMIT ${SUGGESTION_LIMIT}`;
  } else {
    const prefix = `${escapeLike(q)}%`;
    const contains = `%${escapeLike(q)}%`;
    rows = await db.$queryRaw<Row[]>(Prisma.sql`
      SELECT p.id, p.name, p."statusId", p.progress
      FROM project p
      WHERE p."archivedAt" IS NULL
        AND (p."nameNormalized" LIKE ${contains} OR similarity(p."nameNormalized", ${q}) > 0.3)
      ORDER BY
        CASE WHEN p."nameNormalized" LIKE ${prefix} THEN 0
             WHEN p."nameNormalized" LIKE ${contains} THEN 1
             ELSE 2 END,
        similarity(p."nameNormalized", ${q}) DESC,
        p.name
      LIMIT ${SUGGESTION_LIMIT}`);
  }

  const cards = await db.card.findMany({
    where: { projectId: { in: rows.map((r) => r.id) } },
    select: { id: true, projectId: true, start: true, end: true },
  });

  return rows.map((row) => {
    const own = cards.filter((c) => c.projectId === row.id);
    const upcoming = own.filter((c) => c.end > now).sort((a, b) => +a.start - +b.start)[0];
    const latest = [...own].sort((a, b) => +b.end - +a.end)[0];
    const focus = upcoming ?? latest;
    return {
      ...row,
      lastCardEnd: latest ? latest.end.toISOString() : null,
      focusCard: focus ? { id: focus.id, start: focus.start.toISOString() } : null,
    };
  });
}

/** Active, not-done projects that have no card ending in the future: candidates to schedule. */
export async function listUnscheduled(db: PrismaClient, now = new Date()) {
  const projects = await db.project.findMany({
    where: { archivedAt: null, status: { isDone: false }, cards: { none: { end: { gt: now } } } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      statusId: true,
      progress: true,
      cards: { select: { end: true }, orderBy: { end: "desc" }, take: 1 },
    },
  });
  return projects.map(({ cards, ...p }) => ({
    ...p,
    lastCardEnd: cards[0]?.end.toISOString() ?? null,
  }));
}
