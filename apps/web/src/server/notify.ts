import type { Prisma, PrismaClient } from "@jakab/db";

export const BOARD_CHANNEL = "board_changed";

type Db = PrismaClient | Prisma.TransactionClient;

/** Tells every connected board (via SSE) that something changed. Runs inside the caller's transaction. */
export async function notifyBoardChanged(db: Db, entity: string, id?: string) {
  const payload = JSON.stringify({ entity, id });
  await db.$executeRaw`SELECT pg_notify(${BOARD_CHANNEL}, ${payload})`;
}
