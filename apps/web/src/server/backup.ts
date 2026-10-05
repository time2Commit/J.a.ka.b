import type { PrismaClient } from "@jakab/db";
import { execFile } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { badRequest, notFound } from "./errors";
import { exportBoard } from "./export";
import type { StorageDriver } from "./storage";

const execFileAsync = promisify(execFile);

export type BackupKind = "archive" | "database";

export interface BackupFile {
  name: string;
  kind: BackupKind;
  size: number;
  createdAt: string;
}

export interface BackupConfig {
  /** Cron expression for the nightly backup; empty = no schedule (manual backups still work). */
  cron: string;
  dir: string;
  /** How many backups of each kind are kept. */
  keep: number;
}

export function backupConfig(env: Record<string, string | undefined> = process.env): BackupConfig {
  const keep = Number(env.BACKUP_KEEP ?? 7);
  return {
    cron: (env.BACKUP_CRON ?? "").trim(),
    dir: path.resolve(/* turbopackIgnore: true */ env.BACKUP_DIR ?? "./data/backups"),
    keep: Number.isInteger(keep) && keep >= 1 ? keep : 7,
  };
}

// jakab-board-20261005-030000.zip / jakab-db-20261005-030000.dump (UTC)
const NAME = /^jakab-(board|db)-(\d{8}-\d{6})\.(zip|dump)$/;

export const archiveName = (at: Date) => `jakab-board-${stamp(at)}.zip`;
export const databaseName = (at: Date) => `jakab-db-${stamp(at)}.dump`;

function stamp(at: Date) {
  return at
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d+Z$/, "")
    .replace("T", "-");
}

function kindOf(name: string): BackupKind | null {
  const match = NAME.exec(name);
  if (!match) return null;
  return match[1] === "board" ? "archive" : "database";
}

/** Names to delete so that only the `keep` newest of each kind remain. Foreign files are ignored. */
export function selectBackupsToPrune(names: string[], keep: number): string[] {
  const prune: string[] = [];
  for (const kind of ["archive", "database"] as const) {
    // The timestamp is part of the name, so sorting names sorts by time.
    const ofKind = names.filter((n) => kindOf(n) === kind).sort();
    prune.push(...ofKind.slice(0, Math.max(0, ofKind.length - keep)));
  }
  return prune;
}

export async function listBackups(dir: string): Promise<BackupFile[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const files: BackupFile[] = [];
  for (const name of names) {
    const kind = kindOf(name);
    if (!kind) continue;
    const info = await stat(path.join(dir, name)).catch(() => null);
    if (info?.isFile()) {
      files.push({ name, kind, size: info.size, createdAt: info.mtime.toISOString() });
    }
  }
  return files.sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** Absolute path of a backup file, only for names this module creates (never a path). */
export function backupFilePath(dir: string, name: string) {
  if (!NAME.test(name)) throw badRequest("Invalid backup name");
  return path.join(dir, name);
}

export async function statBackup(dir: string, name: string) {
  const file = backupFilePath(dir, name);
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw notFound("Backup");
  return { file, size: info.size };
}

/** `pg_dump` connection settings from a URL, passed through the environment (not the command line). */
export function pgEnvFromUrl(databaseUrl: string): Record<string, string> {
  const url = new URL(databaseUrl);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: url.pathname.replace(/^\//, ""),
  };
}

export type DumpResult =
  { ok: true } | { ok: false; reason: "missing" | "failed"; message: string };

/** Database dump in `pg_dump` custom format (restore with `pg_restore`). */
export async function dumpDatabase(databaseUrl: string, target: string): Promise<DumpResult> {
  try {
    await execFileAsync("pg_dump", ["--format=custom", "--no-owner", "--file", target], {
      env: { ...process.env, ...pgEnvFromUrl(databaseUrl) },
      timeout: 30 * 60 * 1000,
    });
    return { ok: true };
  } catch (error) {
    await rm(target, { force: true });
    const e = error as NodeJS.ErrnoException & { stderr?: string };
    return e.code === "ENOENT"
      ? { ok: false, reason: "missing", message: "pg_dump is not installed" }
      : { ok: false, reason: "failed", message: (e.stderr || e.message).trim().slice(0, 500) };
  }
}

export interface BackupResult {
  archive: BackupFile;
  /** Null when the dump could not be made (see `dumpError`); the archive is still complete. */
  database: BackupFile | null;
  dumpError: string | null;
  pruned: string[];
}

let running: Promise<BackupResult> | null = null;

/**
 * One backup: the whole board as an importable archive (with version history and archived
 * projects) plus a database dump, then rotation. Calls made while one is running share it.
 */
export function runBackup(
  db: PrismaClient,
  storage: StorageDriver,
  options: BackupConfig & { databaseUrl?: string; now?: Date },
): Promise<BackupResult> {
  running ??= doBackup(db, storage, options).finally(() => {
    running = null;
  });
  return running;
}

async function writeAtomically(target: string, write: (partial: string) => Promise<void>) {
  const partial = `${target}.part`;
  try {
    await write(partial);
    await rename(partial, target);
  } catch (error) {
    await rm(partial, { force: true });
    throw error;
  }
}

async function doBackup(
  db: PrismaClient,
  storage: StorageDriver,
  options: BackupConfig & { databaseUrl?: string; now?: Date },
): Promise<BackupResult> {
  const at = options.now ?? new Date();
  await mkdir(options.dir, { recursive: true });

  const archiveFile = archiveName(at);
  await writeAtomically(path.join(options.dir, archiveFile), async (partial) => {
    const { stream } = await exportBoard(db, storage, {
      includeVersions: true,
      includeArchived: true,
    });
    await pipeline(stream, createWriteStream(partial));
  });

  let dumpError: string | null = null;
  const databaseFile = databaseName(at);
  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    dumpError = "DATABASE_URL is not set";
  } else {
    const result = await dumpDatabase(databaseUrl, path.join(options.dir, `${databaseFile}.part`));
    if (result.ok) {
      await rename(
        path.join(options.dir, `${databaseFile}.part`),
        path.join(options.dir, databaseFile),
      );
    } else {
      dumpError = result.message;
    }
  }

  // Rotation only after the new backup is in place.
  const pruned = selectBackupsToPrune(await readdir(options.dir), options.keep);
  await Promise.all(pruned.map((name) => rm(path.join(options.dir, name), { force: true })));

  const files = await listBackups(options.dir);
  return {
    archive: files.find((f) => f.name === archiveFile)!,
    database: files.find((f) => f.name === databaseFile) ?? null,
    dumpError,
    pruned,
  };
}
