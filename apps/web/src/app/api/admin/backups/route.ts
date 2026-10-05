import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { backupConfig, listBackups } from "@/server/backup";
import { runConfiguredBackup } from "@/server/backup-schedule";
import { LIMITS } from "@/server/rate-limit";

/** Backups on disk, with the schedule they are made on (admin). */
export const GET = route(
  async () => {
    const { cron, dir, keep } = backupConfig();
    return { cron: cron || null, keep, files: await listBackups(dir) };
  },
  { admin: true },
);

/** Makes a backup now (admin). */
export const POST = route(
  async () => NextResponse.json(await runConfiguredBackup(), { status: 201 }),
  { admin: true, rateLimit: LIMITS.backup },
);
