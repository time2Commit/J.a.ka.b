import { rm } from "node:fs/promises";
import { DEFAULT_STATUSES } from "@jakab/db/defaults";
import { createPrismaClient } from "@jakab/db";

/** Resets the (local) test database: no users, no projects or templates, default statuses only. */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error("Refusing to reset a non-local database");
  }
  // Saved browser sessions belong to users that are about to be deleted.
  await rm("e2e/.auth", { recursive: true, force: true });
  const prisma = createPrismaClient(url);
  await prisma.$transaction([
    prisma.project.deleteMany(),
    prisma.template.deleteMany(),
    prisma.label.deleteMany(),
    prisma.status.deleteMany(),
    prisma.user.deleteMany(),
    prisma.workspace.deleteMany(),
    ...DEFAULT_STATUSES.map((data) => prisma.status.create({ data })),
    prisma.workspace.create({ data: {} }),
  ]);
  await prisma.$disconnect();
}
