import type { PrismaClient } from "@jakab/db";

/**
 * The workspace settings. The row is created the first time it is needed; every later read is a
 * plain query (an `upsert` here would write to the database on each page load).
 */
export async function getWorkspace(db: PrismaClient) {
  return (
    (await db.workspace.findUnique({ where: { id: "default" } })) ??
    db.workspace.upsert({ where: { id: "default" }, update: {}, create: {} })
  );
}
