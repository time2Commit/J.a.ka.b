import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

export * from "./generated/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/**
 * `next build` imports every route to inspect it, with no database around (a Docker build has
 * none). It gets a client that points nowhere and is never used; a real run still needs the URL.
 */
const building = process.env.NEXT_PHASE === "phase-production-build";
const BUILD_ONLY_URL = "postgresql://build.invalid/build";

/** Shared client; reused across hot reloads in development. */
export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient(process.env.DATABASE_URL ?? (building ? BUILD_ONLY_URL : undefined));
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
