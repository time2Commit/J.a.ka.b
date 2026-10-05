import { prisma } from "@jakab/db";
import { Cron } from "croner";
import { backupConfig, runBackup } from "./backup";
import { getStorage } from "./storage";

/** Runs one backup with the environment's settings (used by the schedule and by "Back up now"). */
export const runConfiguredBackup = () => runBackup(prisma, getStorage(), backupConfig());

/** Starts the nightly backup when `BACKUP_CRON` is set. Returns the schedule, or null if disabled. */
export function startBackupSchedule() {
  const { cron, dir, keep } = backupConfig();
  if (!cron) return null;
  const job = new Cron(
    cron,
    {
      timezone: process.env.TZ || undefined,
      // A run still in progress when the next one is due is skipped, never doubled.
      protect: true,
      unref: true,
      catch: (error) => console.error("backup failed", error),
    },
    async () => {
      const result = await runConfiguredBackup();
      console.log(
        `backup: ${result.archive.name}${result.database ? ` + ${result.database.name}` : ""} (keeping ${keep} in ${dir})`,
      );
      if (result.dumpError) console.warn(`backup: database dump skipped: ${result.dumpError}`);
    },
  );
  console.log(`backup: scheduled "${cron}", next run ${job.nextRun()?.toISOString() ?? "never"}`);
  return job;
}
