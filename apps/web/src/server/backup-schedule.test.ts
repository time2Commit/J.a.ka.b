import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dir: string;
let uploads: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "jakab-sched-"));
  uploads = await mkdtemp(path.join(tmpdir(), "jakab-sched-up-"));
  process.env.BACKUP_DIR = dir;
  process.env.UPLOAD_DIR = uploads;
  process.env.BACKUP_KEEP = "2";
});

afterAll(async () => {
  delete process.env.BACKUP_CRON;
  delete process.env.BACKUP_DIR;
  delete process.env.UPLOAD_DIR;
  delete process.env.BACKUP_KEEP;
  await rm(dir, { recursive: true, force: true });
  await rm(uploads, { recursive: true, force: true });
});

describe("startBackupSchedule", () => {
  it("does nothing without BACKUP_CRON", async () => {
    delete process.env.BACKUP_CRON;
    const { startBackupSchedule } = await import("./backup-schedule");
    expect(startBackupSchedule()).toBeNull();
  });

  it("runs a backup when the schedule fires", async () => {
    process.env.BACKUP_CRON = "* * * * * *"; // every second
    const { startBackupSchedule } = await import("./backup-schedule");
    const job = startBackupSchedule();
    expect(job).not.toBeNull();
    try {
      const end = Date.now() + 15_000;
      let names: string[] = [];
      while (Date.now() < end && !names.some((n) => n.endsWith(".zip"))) {
        await new Promise((r) => setTimeout(r, 200));
        names = await readdir(dir);
      }
      expect(names.some((n) => /^jakab-board-\d{8}-\d{6}\.zip$/.test(n))).toBe(true);
    } finally {
      job!.stop();
    }
  }, 20_000);

  it("rejects an invalid expression instead of scheduling it", async () => {
    process.env.BACKUP_CRON = "not a cron";
    const { startBackupSchedule } = await import("./backup-schedule");
    expect(() => startBackupSchedule()).toThrow();
  });
});
