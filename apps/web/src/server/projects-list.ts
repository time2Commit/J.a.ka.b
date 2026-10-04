import type { PrismaClient } from "@jakab/db";

/** Active projects with their status and last scheduled card date, for pickers. */
export async function listProjects(db: PrismaClient) {
  const projects = await db.project.findMany({
    where: { archivedAt: null },
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
