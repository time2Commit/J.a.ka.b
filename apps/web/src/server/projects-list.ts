import type { PrismaClient } from "@jakab/db";

/**
 * Active projects with their status, folder and dates, for pickers and the project tree.
 * `lastModified` is the latest change to the note or to any of its cards (moving a project
 * between folders is not a modification).
 */
export async function listProjects(db: PrismaClient) {
  // The two card dates are worked out by the database: reading every card of every project just
  // to take a maximum would cost more with each card that is added.
  const [projects, cardDates] = await Promise.all([
    db.project.findMany({
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
      },
    }),
    db.card.groupBy({
      by: ["projectId"],
      where: { project: { archivedAt: null } },
      _max: { end: true, updatedAt: true },
    }),
  ]);
  const cards = new Map(cardDates.map((c) => [c.projectId, c._max]));
  return projects.map(({ note, createdAt, ...p }) => {
    const latest = cards.get(p.id);
    const times = [createdAt, note?.updatedAt, latest?.updatedAt].flatMap((d) =>
      d ? d.getTime() : [],
    );
    return {
      ...p,
      lastCardEnd: latest?.end ? latest.end.toISOString() : null,
      lastModified: new Date(Math.max(...times)).toISOString(),
    };
  });
}
