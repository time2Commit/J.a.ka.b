import { prisma } from "@jakab/db";
import { Cron } from "croner";
import { syncDueSources } from "./sources/sync";

/** Default: every hour, on the hour. Each run only updates the sources whose own time has come. */
const DEFAULT_CRON = "0 * * * *";

/**
 * Starts the check that keeps the sources up to date: every hour it updates the enabled sources
 * whose `nextSyncAt` has passed (each source declares how often it wants updating, daily for the
 * one that exists today). `SOURCES_SYNC_CRON` changes the schedule; set but empty, it is off.
 */
export function startSourceSchedule() {
  const cron = process.env.SOURCES_SYNC_CRON ?? DEFAULT_CRON;
  if (!cron) return null;
  const job = new Cron(
    cron,
    {
      timezone: process.env.TZ || undefined,
      // A run still going when the next one is due is skipped, never doubled.
      protect: true,
      unref: true,
      catch: (error) => console.error("source sync failed", error),
    },
    async () => {
      const { due, synced } = await syncDueSources(prisma);
      if (due > 0) console.log(`sources: ${synced} of ${due} due source(s) updated`);
    },
  );
  console.log(`sources: checked "${cron}", next check ${job.nextRun()?.toISOString() ?? "never"}`);
  return job;
}
