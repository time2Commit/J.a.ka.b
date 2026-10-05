import { createPrismaClient } from "@jakab/db";
import {
  archiveBoardSchema,
  archiveManifestSchema,
  archiveProjectSchema,
  archiveVersionsSchema,
} from "@jakab/shared";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportBoard, exportProject, slugify } from "./export";
import { FileSystemStorage } from "./storage";
import { openZipBuffer } from "./zip-reader";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
let root: string;
let storage: FileSystemStorage;
let statusId: string;
let labelId: string;
let userId: string;
let projectId: string;
const projectName = `Éxport Piano ${run}`;
const email = `export.${run}@example.com`;
const FILE = Buffer.from("hello attachment");

async function toBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "jakab-export-"));
  storage = new FileSystemStorage(root);
  statusId = (
    await prisma.status.create({ data: { name: `Ex ${run}`, color: "#222222", order: 93 } })
  ).id;
  labelId = (await prisma.label.create({ data: { name: `Lbl ${run}`, color: "#333333" } })).id;
  userId = (
    await prisma.user.create({
      data: { id: `u-export-${run}`, name: "Export Tester", email, avatarColor: "#444444" },
    })
  ).id;
  const project = await prisma.project.create({
    data: {
      name: projectName,
      nameNormalized: projectName.toLowerCase(),
      statusId,
      progress: 40,
      createdById: userId,
      labels: { create: { labelId } },
      members: { create: { userId } },
    },
  });
  projectId = project.id;
  const attachmentId = `att-${run}`;
  const storageKey = `${projectId}/${attachmentId}`;
  await storage.put(storageKey, Readable.from([FILE]), 1024);
  await prisma.attachment.create({
    data: {
      id: attachmentId,
      projectId,
      originalName: "my notes.txt",
      mime: "text/plain",
      size: FILE.length,
      sha256: "abc",
      storageKey,
      uploadedBy: userId,
    },
  });
  // A row whose bytes are gone must not break the export.
  await prisma.attachment.create({
    data: {
      id: `gone-${run}`,
      projectId,
      originalName: "gone.txt",
      mime: "text/plain",
      size: 1,
      sha256: "x",
      storageKey: `${projectId}/gone-${run}`,
      uploadedBy: userId,
    },
  });
  const note = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Plan" }] },
      {
        type: "fileEmbed",
        attrs: { attachmentId, name: "my notes.txt", mime: "text/plain", size: FILE.length },
      },
    ],
  };
  await prisma.noteDocument.create({ data: { projectId, json: note } });
  await prisma.noteVersion.create({
    data: {
      projectId,
      yState: Buffer.from([]),
      json: note,
      authors: [userId],
      reason: "manual",
      label: "Draft",
    },
  });
  await prisma.card.create({
    data: {
      projectId,
      title: "Kick-off",
      start: new Date("2026-03-02T09:00:00Z"),
      end: new Date("2026-03-02T10:00:00Z"),
      createdById: userId,
      members: { create: { userId } },
      labels: { create: { labelId } },
    },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: projectId } });
  await prisma.label.deleteMany({ where: { id: labelId } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

describe("slugify", () => {
  it("makes folder-safe names", () => {
    expect(slugify("Éxport  Piano / 2026!")).toBe("export-piano-2026");
    expect(slugify("???")).toBe("project");
  });
});

describe("exportProject", () => {
  it("writes a manifest, the project data, readable Markdown and the attachment bytes", async () => {
    const { stream, fileName } = await exportProject(prisma, storage, projectId, {
      includeVersions: true,
    });
    expect(fileName).toBe(`export-piano-${run}.zip`);
    const zip = await openZipBuffer(await toBuffer(stream));
    const slug = `export-piano-${run}`;
    const read = async (name: string) => (await zip.readBuffer(name, 1_000_000)).toString("utf8");

    const manifest = archiveManifestSchema.parse(JSON.parse(await read("manifest.json")));
    expect(manifest).toMatchObject({ kind: "project", projects: [{ slug, name: projectName }] });

    const project = archiveProjectSchema.parse(
      JSON.parse(await read(`projects/${slug}/project.json`)),
    );
    expect(project).toMatchObject({
      name: projectName,
      progress: 40,
      status: { name: `Ex ${run}` },
      members: [email],
      labels: [{ name: `Lbl ${run}` }],
      cards: [{ title: "Kick-off", members: [email], labels: [`Lbl ${run}`] }],
    });
    expect(project.attachments.map((a) => a.id)).toEqual([`att-${run}`]);

    const md = await read(`projects/${slug}/note.md`);
    expect(md).toContain(`name: ${JSON.stringify(projectName)}`);
    expect(md).toContain("# Plan");
    expect(md).toContain(`[my notes.txt](attachments/att-${run}-my%20notes.txt)`);

    expect(
      (await zip.readBuffer(`projects/${slug}/attachments/att-${run}-my notes.txt`, 1000)).equals(
        FILE,
      ),
    ).toBe(true);
    const versions = archiveVersionsSchema.parse(
      JSON.parse(await read(`projects/${slug}/versions.json`)),
    );
    expect(versions.versions).toMatchObject([
      { reason: "manual", label: "Draft", authors: [email] },
    ]);
    zip.close();
  });

  it("leaves the version history out unless asked", async () => {
    const { stream } = await exportProject(prisma, storage, projectId, { includeVersions: false });
    const zip = await openZipBuffer(await toBuffer(stream));
    expect(zip.names.some((n) => n.endsWith("versions.json"))).toBe(false);
    zip.close();
  });
});

describe("exportBoard", () => {
  it("adds board settings, statuses, labels and people, never credentials", async () => {
    const { stream, fileName } = await exportBoard(prisma, storage, { includeVersions: false });
    expect(fileName).toMatch(/^jakab-board-\d{4}-\d{2}-\d{2}\.zip$/);
    const raw = await toBuffer(stream);
    const zip = await openZipBuffer(raw);
    const manifest = archiveManifestSchema.parse(
      JSON.parse((await zip.readBuffer("manifest.json", 1_000_000)).toString()),
    );
    expect(manifest.kind).toBe("board");
    expect(manifest.projects.map((p) => p.name)).toContain(projectName);

    const boardText = (await zip.readBuffer("board.json", 1_000_000)).toString();
    const board = archiveBoardSchema.parse(JSON.parse(boardText));
    expect(board.statuses.map((s) => s.name)).toContain(`Ex ${run}`);
    expect(board.labels.map((l) => l.name)).toContain(`Lbl ${run}`);
    expect(board.users.map((u) => u.email)).toContain(email);
    expect(boardText).not.toMatch(/password|token/i);
    zip.close();
  });

  it("skips archived projects unless asked", async () => {
    await prisma.project.update({ where: { id: projectId }, data: { archivedAt: new Date() } });
    try {
      const names = async (includeArchived: boolean) => {
        const { stream } = await exportBoard(prisma, storage, {
          includeVersions: false,
          includeArchived,
        });
        const zip = await openZipBuffer(await toBuffer(stream));
        const manifest = JSON.parse((await zip.readBuffer("manifest.json", 1_000_000)).toString());
        zip.close();
        return (manifest.projects as { name: string }[]).map((p) => p.name);
      };
      expect(await names(false)).not.toContain(projectName);
      expect(await names(true)).toContain(projectName);
    } finally {
      await prisma.project.update({ where: { id: projectId }, data: { archivedAt: null } });
    }
  });
});
