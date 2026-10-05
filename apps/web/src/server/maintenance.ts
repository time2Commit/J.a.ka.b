import { prisma } from "@jakab/db";
import { cleanupOrphanAttachments } from "./orphans";
import { getStorage } from "./storage";

/** Days an unreferenced file is kept before it is deleted. */
const orphanDays = () => Number(process.env.ORPHAN_FILE_DAYS ?? 14);

export const runOrphanCleanup = () =>
  cleanupOrphanAttachments(prisma, getStorage(), { olderThanDays: orphanDays() });
