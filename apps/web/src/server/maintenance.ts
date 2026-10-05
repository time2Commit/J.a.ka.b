import { prisma } from "@jakab/db";
import { cleanupStaleImports } from "./import-store";
import { cleanupOrphanAttachments } from "./orphans";
import { getStorage } from "./storage";

/** Days an unreferenced file is kept before it is deleted. */
const orphanDays = () => Number(process.env.ORPHAN_FILE_DAYS ?? 14);

export const runOrphanCleanup = () =>
  cleanupOrphanAttachments(prisma, getStorage(), { olderThanDays: orphanDays() });

/** Archives uploaded for an import that was never confirmed are dropped after an hour. */
export const runImportCleanup = () => cleanupStaleImports(60 * 60 * 1000);
