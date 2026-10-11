import type { PrismaClient } from "@jakab/db";

/**
 * Active projects with their status, folder and dates, for pickers and the project tree.
 * `lastModified` is the latest change to the note or to any of its cards (moving a project
 * between folders is not a modification).
 */
export async function listProjects(db: PrismaClient) {
  const projects = await db.project.findMany({
    where: { archivedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      statusId: true,
      progress: true,
      folderId: true,
      createdAt: true,
      note: { select: { updatedAt: true } },
      cards: { select: { end: true, updatedAt: true } },
    },
  });
  return projects.map(({ cards, note, createdAt, ...p }) => {
    const times = [
      createdAt.getTime(),
      note?.updatedAt.getTime() ?? 0,
      ...cards.map((c) => c.updatedAt.getTime()),
    ];
    return {
      ...p,
      lastCardEnd: cards.length
        ? new Date(Math.max(...cards.map((c) => c.end.getTime()))).toISOString()
        : null,
      lastModified: new Date(Math.max(...times)).toISOString(),
    };
  });
}
