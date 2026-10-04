import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@jakab/db";
import { sanitizeFileName, sanitizeMime, saveAttachment } from "./attachments";
import { FileSystemStorage } from "./storage";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
let root: string;
let storage: FileSystemStorage;
let statusId: string;
let projectId: string;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "jakab-attachments-"));
  storage = new FileSystemStorage(root);
  statusId = (
    await prisma.status.create({ data: { name: `S ${run}`, color: "#111111", order: 96 } })
  ).id;
  const name = `Files ${run}`;
  projectId = (
    await prisma.project.create({
      data: { name, nameNormalized: name.toLowerCase(), statusId, createdById: "u" },
    })
  ).id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

const upload = (over: Partial<Parameters<typeof saveAttachment>[2]> = {}) =>
  saveAttachment(prisma, storage, {
    projectId,
    userId: "u1",
    name: "report.pdf",
    mime: "application/pdf",
    body: Readable.from([Buffer.from("%PDF-1.4 fake")]),
    maxBytes: 1000,
    ...over,
  });

describe("saveAttachment", () => {
  it("stores the bytes, the database row and an activity entry", async () => {
    const dto = await upload();
    expect(dto).toMatchObject({ name: "report.pdf", mime: "application/pdf", size: 13 });
    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row).toMatchObject({
      projectId,
      uploadedBy: "u1",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(await readdir(path.join(root, projectId))).toContain(dto.id);
    expect(
      await prisma.activity.count({ where: { projectId, type: "file.added" } }),
    ).toBeGreaterThan(0);
  });

  it("rejects unknown projects and oversized files without leaving anything behind", async () => {
    await expect(upload({ projectId: "missing" })).rejects.toMatchObject({ status: 404 });
    const before = await prisma.attachment.count({ where: { projectId } });
    await expect(
      upload({ body: Readable.from([Buffer.alloc(5000)]), maxBytes: 100 }),
    ).rejects.toMatchObject({ status: 413 });
    expect(await prisma.attachment.count({ where: { projectId } })).toBe(before);
    expect(await readdir(path.join(root, projectId))).toHaveLength(before);
  });
});

describe("sanitizers", () => {
  it("keeps only a safe file name", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\temp\\a.txt")).toBe("a.txt");
    expect(sanitizeFileName("  \u0000\u0007 ")).toBe("file");
    expect(sanitizeFileName("x".repeat(400))).toHaveLength(255);
  });
  it("falls back to a generic type for odd content types", () => {
    expect(sanitizeMime("image/PNG; charset=binary")).toBe("image/png");
    expect(sanitizeMime("text/html<script>")).toBe("application/octet-stream");
    expect(sanitizeMime(null)).toBe("application/octet-stream");
  });
});
