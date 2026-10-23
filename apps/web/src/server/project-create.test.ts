import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createPrismaClient } from "@jakab/db";
import { createFolder } from "./folders";
import { createProject, deleteProject } from "./projects";
import { FileSystemStorage } from "./storage";
import { createTemplate } from "./templates";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const name = (n: string) => `${n} ${run}`;
let storage: FileSystemStorage;
let root: string;
let statusId: string;
let creatorId: string;
const projectIds: string[] = [];

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "jakab-project-"));
  storage = new FileSystemStorage(root);
  statusId = (
    await prisma.status.create({ data: { name: name("Create"), color: "#123456", order: 95 } })
  ).id;
  creatorId = (
    await prisma.user.create({
      data: { id: `u-creator-${run}`, name: "Creator", email: `creator.${run}@example.com` },
    })
  ).id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.template.deleteMany({ where: { name: { contains: run } } });
  await prisma.projectFolder.deleteMany({ where: { name: { contains: run } } });
  await prisma.user.deleteMany({ where: { id: creatorId } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

describe("createProject", () => {
  it("makes a project and its empty note without any card, in a folder", async () => {
    const folder = await createFolder(prisma, { name: name("Where"), parentId: null });
    const project = await createProject(
      prisma,
      { name: name("Standalone"), folderId: folder.id, templateId: null },
      creatorId,
    );
    projectIds.push(project.id);
    const row = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      include: { cards: true, note: true },
    });
    expect(row).toMatchObject({ name: name("Standalone"), folderId: folder.id, progress: 0 });
    expect(row.cards).toHaveLength(0);
    expect(row.note).not.toBeNull();
    expect(await prisma.activity.count({ where: { projectId: project.id } })).toBe(1);
  });

  it("starts from a template: its note and checklist fill the new note", async () => {
    const template = await createTemplate(
      prisma,
      {
        name: name("Kit"),
        defaults: { checklist: ["Do the first thing"] },
        note: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: `Intro ${run}` }] }],
        },
      },
      creatorId,
    );
    const project = await createProject(
      prisma,
      { name: name("FromTemplate"), folderId: null, templateId: template.id },
      creatorId,
    );
    projectIds.push(project.id);
    const note = await prisma.noteDocument.findUniqueOrThrow({ where: { projectId: project.id } });
    const text = JSON.stringify(note.json);
    expect(text).toContain(`Intro ${run}`);
    expect(text).toContain("Do the first thing");
  });

  it("refuses a duplicate name, a missing template and a folder of the other tree", async () => {
    const first = await createProject(
      prisma,
      { name: name("Unique"), folderId: null, templateId: null },
      creatorId,
    );
    projectIds.push(first.id);
    await expect(
      createProject(prisma, { name: name("UNIQUE"), folderId: null, templateId: null }, creatorId),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      createProject(
        prisma,
        { name: name("NoTemplate"), folderId: null, templateId: "missing" },
        creatorId,
      ),
    ).rejects.toMatchObject({ status: 404 });
    const templateFolder = await createFolder(prisma, {
      kind: "template",
      name: name("TplFolder"),
      parentId: null,
    });
    await expect(
      createProject(
        prisma,
        { name: name("WrongTree"), folderId: templateFolder.id, templateId: null },
        creatorId,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("says that a status is missing when none exists yet", async () => {
    // Emptying the shared status table would disturb the other test files: a stand-in database
    // answers the few lookups made before the status is chosen.
    const empty = {
      project: { findUnique: async () => null },
      status: { findUnique: async () => null, findFirst: async () => null },
    };
    const db = { $transaction: (fn: (tx: typeof empty) => unknown) => fn(empty) };
    await expect(
      createProject(
        db as unknown as typeof prisma,
        { name: name("NoStatus"), folderId: null, templateId: null },
        creatorId,
      ),
    ).rejects.toMatchObject({ status: 422 });
  });
});

describe("deleteProject", () => {
  it("deletes the project with its cards and files, for an administrator or the creator only", async () => {
    const project = await createProject(
      prisma,
      { name: name("Doomed"), folderId: null, templateId: null },
      creatorId,
    );
    await prisma.card.create({
      data: {
        projectId: project.id,
        start: new Date("2026-06-01T09:00:00Z"),
        end: new Date("2026-06-01T10:00:00Z"),
        createdById: creatorId,
        statusId,
      },
    });
    const key = `${project.id}/att-1`;
    await storage.put(key, Readable.from([Buffer.from("bytes")]), 1024);
    await prisma.attachment.create({
      data: {
        id: `att-${run}`,
        projectId: project.id,
        originalName: "a.txt",
        mime: "text/plain",
        size: 5,
        sha256: "x",
        storageKey: key,
        uploadedBy: creatorId,
      },
    });

    await expect(
      deleteProject(prisma, storage, project.id, { id: "someone-else", role: "member" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await prisma.project.count({ where: { id: project.id } })).toBe(1);

    await deleteProject(prisma, storage, project.id, { id: creatorId, role: "member" });
    expect(await prisma.project.count({ where: { id: project.id } })).toBe(0);
    expect(await prisma.card.count({ where: { projectId: project.id } })).toBe(0);
    await expect(storage.open(key)).rejects.toBeDefined();

    await expect(
      deleteProject(prisma, storage, project.id, { id: creatorId, role: "admin" }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("lets an administrator delete a project created by somebody else", async () => {
    const project = await createProject(
      prisma,
      { name: name("AdminDeletes"), folderId: null, templateId: null },
      creatorId,
    );
    await deleteProject(prisma, storage, project.id, { id: "admin", role: "admin" });
    expect(await prisma.project.count({ where: { id: project.id } })).toBe(0);
  });
});
