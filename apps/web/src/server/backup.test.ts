import { createPrismaClient } from "@jakab/db";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  archiveName,
  backupConfig,
  backupFilePath,
  databaseName,
  listBackups,
  pgEnvFromUrl,
  runBackup,
  selectBackupsToPrune,
  statBackup,
} from "./backup";
import { parseArchive } from "./import";
import { FileSystemStorage } from "./storage";
import { openZipFile } from "./zip-reader";

const prisma = createPrismaClient();
const run = promisify(execFile);
const hasPgDump = await run("pg_dump", ["--version"]).then(
  () => true,
  () => false,
);
const projectName = `Backed up ${Date.now().toString(36)}`;
let root: string;
let storage: FileSystemStorage;
let statusId: string;
let projectId: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "jakab-backup-"));
  storage = new FileSystemStorage(path.join(root, "files"));
  statusId = (
    await prisma.status.create({
      data: { name: `Bk ${Date.now().toString(36)}`, color: "#101010", order: 89 },
    })
  ).id;
  projectId = (
    await prisma.project.create({
      data: {
        name: projectName,
        nameNormalized: projectName.toLowerCase(),
        statusId,
        createdById: "u",
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

describe("names and rotation", () => {
  it("names backups by UTC time so they sort chronologically", () => {
    const at = new Date("2026-10-05T03:00:07.123Z");
    expect(archiveName(at)).toBe("jakab-board-20261005-030007.zip");
    expect(databaseName(at)).toBe("jakab-db-20261005-030007.dump");
  });

  it("keeps the newest N of each kind and never touches other files", () => {
    const names = [
      "jakab-board-20261001-030000.zip",
      "jakab-board-20261002-030000.zip",
      "jakab-board-20261003-030000.zip",
      "jakab-db-20261001-030000.dump",
      "jakab-db-20261003-030000.dump",
      "notes.txt",
      "jakab-board-20261001-030000.zip.part",
    ];
    expect(selectBackupsToPrune(names, 2).sort()).toEqual(["jakab-board-20261001-030000.zip"]);
    expect(selectBackupsToPrune(names, 1).sort()).toEqual([
      "jakab-board-20261001-030000.zip",
      "jakab-board-20261002-030000.zip",
      "jakab-db-20261001-030000.dump",
    ]);
    expect(selectBackupsToPrune(names, 10)).toEqual([]);
  });

  it("only accepts the names it creates as backup files", async () => {
    expect(() => backupFilePath("/b", "../../etc/passwd")).toThrow();
    expect(() => backupFilePath("/b", "jakab-board-20261001-030000.zip/../x")).toThrow();
    expect(backupFilePath("/b", "jakab-db-20261001-030000.dump")).toBe(
      "/b/jakab-db-20261001-030000.dump",
    );
    await expect(statBackup(root, "jakab-db-20990101-000000.dump")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("configuration", () => {
  it("is off without a cron expression, and falls back to sane values", () => {
    expect(backupConfig({}).cron).toBe("");
    expect(backupConfig({ BACKUP_CRON: " 0 3 * * * " }).cron).toBe("0 3 * * *");
    expect(backupConfig({ BACKUP_KEEP: "3" }).keep).toBe(3);
    expect(backupConfig({ BACKUP_KEEP: "0" }).keep).toBe(7);
    expect(backupConfig({ BACKUP_KEEP: "x" }).keep).toBe(7);
  });

  it("passes database credentials through the environment, decoded", () => {
    // Built at run time: fake credentials, and no connection string literal in the source.
    const url = new URL("postgresql://db.example.com:6543/app");
    url.username = "us@er";
    url.password = "p/w";
    expect(pgEnvFromUrl(url.toString())).toEqual({
      PGHOST: "db.example.com",
      PGPORT: "6543",
      PGUSER: "us@er",
      PGPASSWORD: "p/w",
      PGDATABASE: "app",
    });
  });
});

describe("runBackup", () => {
  it("writes an importable archive and a database dump, then rotates", async () => {
    const dir = path.join(root, "out");
    const config = { cron: "", dir, keep: 2 };
    const at = (n: number) => new Date(`2026-10-0${n}T03:00:00Z`);

    const first = await runBackup(prisma, storage, { ...config, now: at(1) });
    // The archive is the board archive: it reads back and contains the project.
    const zip = await openZipFile(path.join(dir, first.archive.name));
    const parsed = await parseArchive(zip);
    zip.close();
    expect(parsed.manifest.kind).toBe("board");
    expect(parsed.projects.map((p) => p.data.name)).toContain(projectName);

    if (hasPgDump) {
      expect(first.dumpError).toBeNull();
      expect(first.database!.size).toBeGreaterThan(0);
      // A real custom-format dump: pg_restore can list it.
      const { stdout } = await run("pg_restore", ["--list", path.join(dir, first.database!.name)]);
      expect(stdout).toContain("project");
    }

    await runBackup(prisma, storage, { ...config, now: at(2) });
    const third = await runBackup(prisma, storage, { ...config, now: at(3) });

    const files = await listBackups(dir);
    expect(files.filter((f) => f.kind === "archive").map((f) => f.name)).toEqual([
      "jakab-board-20261003-030000.zip",
      "jakab-board-20261002-030000.zip",
    ]);
    expect(third.pruned).toContain("jakab-board-20261001-030000.zip");
    // No half-written files are left behind.
    expect((await readdir(dir)).some((n) => n.endsWith(".part"))).toBe(false);
  });

  it("still delivers the archive when the dump cannot be made", async () => {
    const dir = path.join(root, "nodump");
    const unreachable = new URL("postgresql://127.0.0.1:1/none");
    unreachable.username = "nobody";
    unreachable.password = "wrong";
    const result = await runBackup(prisma, storage, {
      cron: "",
      dir,
      keep: 3,
      databaseUrl: unreachable.toString(),
      now: new Date("2026-11-01T03:00:00Z"),
    });
    expect(result.archive.size).toBeGreaterThan(0);
    expect(result.database).toBeNull();
    expect(result.dumpError).toBeTruthy();
    expect(await readdir(dir)).toEqual([result.archive.name]);
  });

  it("shares one run between simultaneous calls", async () => {
    const dir = path.join(root, "shared");
    const config = { cron: "", dir, keep: 3, now: new Date("2026-12-01T03:00:00Z") };
    const [a, b] = await Promise.all([
      runBackup(prisma, storage, config),
      runBackup(prisma, storage, config),
    ]);
    expect(a).toBe(b);
  });

  it("lists only backup files, newest first", async () => {
    const dir = path.join(root, "list");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "jakab-board-20261001-030000.zip"), "a");
    await writeFile(path.join(dir, "jakab-db-20261002-030000.dump"), "bb");
    await writeFile(path.join(dir, "readme.txt"), "x");
    await utimes(path.join(dir, "readme.txt"), new Date(), new Date());
    const files = await listBackups(dir);
    expect(files.map((f) => [f.name, f.kind, f.size])).toEqual([
      ["jakab-db-20261002-030000.dump", "database", 2],
      ["jakab-board-20261001-030000.zip", "archive", 1],
    ]);
    expect(await listBackups(path.join(root, "missing"))).toEqual([]);
  });
});
