import { createPrismaClient } from "@jakab/db";
import type { CardCreateInput } from "@jakab/shared";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCard } from "./cards";
import { collectAttachmentIds } from "./orphans";
import { FileSystemStorage } from "./storage";
import {
  createTemplate,
  deleteTemplate,
  listTemplates,
  saveProjectAsTemplate,
  updateTemplate,
} from "./templates";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const FILE = Buffer.from("template test file");

let root: string;
let storage: FileSystemStorage;
let userId: string;
let statusA: string;
let statusB: string;
let labelId: string;
let sourceId: string;
const createdProjects = new Set<string>();
const createdTemplates = new Set<string>();

const input = (patch: Partial<CardCreateInput>): CardCreateInput => ({
  start: new Date("2026-06-01T08:00:00Z"),
  end: new Date("2026-06-01T09:00:00Z"),
  allDay: false,
  labelIds: [],
  memberIds: [],
  ...patch,
});
const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const embed = (attachmentId: string) => ({
  type: "fileEmbed",
  attrs: { attachmentId, name: "f.txt", mime: "text/plain", size: FILE.length },
});

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "jakab-tpl-"));
  storage = new FileSystemStorage(root);
  userId = (
    await prisma.user.create({
      data: { id: `u-tpl-${run}`, name: "Tpl User", email: `tpl.${run}@example.com` },
    })
  ).id;
  // Statuses sort by `order`: A is the first of the two (the global first may be another test's).
  statusA = (
    await prisma.status.create({ data: { name: `TA ${run}`, color: "#111111", order: -50 } })
  ).id;
  statusB = (
    await prisma.status.create({ data: { name: `TB ${run}`, color: "#222222", order: 91 } })
  ).id;
  labelId = (await prisma.label.create({ data: { name: `TL ${run}`, color: "#333333" } })).id;

  const name = `Source ${run}`;
  const source = await prisma.project.create({
    data: {
      name,
      nameNormalized: name.toLowerCase(),
      statusId: statusB,
      color: "#abcdef",
      createdById: userId,
      labels: { create: { labelId } },
      members: { create: { userId } },
    },
  });
  sourceId = source.id;
  createdProjects.add(sourceId);
  const attachmentId = `src-att-${run}`;
  const key = `${sourceId}/${attachmentId}`;
  await storage.put(key, Readable.from([FILE]), 1024);
  await prisma.attachment.create({
    data: {
      id: attachmentId,
      projectId: sourceId,
      originalName: "f.txt",
      mime: "text/plain",
      size: FILE.length,
      sha256: "x",
      storageKey: key,
      uploadedBy: userId,
    },
  });
  await prisma.noteDocument.create({
    data: {
      projectId: sourceId,
      json: { type: "doc", content: [para("Source note"), embed(attachmentId)] },
    },
  });
  await prisma.card.create({
    data: {
      projectId: sourceId,
      start: new Date("2026-05-04T09:00:00Z"),
      end: new Date("2026-05-04T11:30:00Z"),
      createdById: userId,
    },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: [...createdProjects] } } });
  await prisma.template.deleteMany({ where: { id: { in: [...createdTemplates] } } });
  await prisma.label.deleteMany({ where: { id: labelId } });
  await prisma.status.deleteMany({ where: { id: { in: [statusA, statusB] } } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

describe("templates", () => {
  it("creates, lists, updates and deletes templates; names are unique; files are dropped", async () => {
    const created = await createTemplate(
      prisma,
      {
        name: `Kick-off ${run}`,
        defaults: {
          statusId: statusA,
          labelIds: [labelId],
          memberIds: [],
          durationMin: 90,
          checklist: ["Invite"],
        },
        note: { type: "doc", content: [para("Agenda"), embed("whatever")] },
      },
      userId,
    );
    createdTemplates.add(created.id);
    expect(JSON.stringify(created.note)).toContain("Agenda");
    expect(JSON.stringify(created.note)).not.toContain("fileEmbed");

    await expect(createTemplate(prisma, { ...created, note: null }, userId)).rejects.toMatchObject({
      status: 409,
    });

    expect((await listTemplates(prisma)).map((t) => t.id)).toContain(created.id);
    const updated = await updateTemplate(prisma, created.id, {
      name: `Kick-off 2 ${run}`,
      defaults: { ...created.defaults, durationMin: 30 },
    });
    expect(updated).toMatchObject({
      name: `Kick-off 2 ${run}`,
      defaults: { durationMin: 30 },
      hasNote: true,
    });
    await expect(updateTemplate(prisma, "missing", { name: "x" })).rejects.toMatchObject({
      status: 404,
    });

    await deleteTemplate(prisma, created.id);
    await expect(deleteTemplate(prisma, created.id)).rejects.toMatchObject({ status: 404 });
  });

  it("saves a project as a template with its settings, note and the first card's length", async () => {
    const template = await saveProjectAsTemplate(prisma, sourceId, `From project ${run}`, userId);
    createdTemplates.add(template.id);
    expect(template.defaults).toMatchObject({
      statusId: statusB,
      labelIds: [labelId],
      memberIds: [userId],
      durationMin: 150,
    });
    expect(JSON.stringify(template.note)).toContain("Source note");
    expect(JSON.stringify(template.note)).not.toContain("fileEmbed");
  });

  it("starts a new project from a template: defaults, note with checklist, link kept", async () => {
    const template = await createTemplate(
      prisma,
      {
        name: `Defaults ${run}`,
        defaults: {
          statusId: statusB,
          labelIds: [labelId, "deleted-label"],
          memberIds: [userId],
          durationMin: 45,
          checklist: ["First", "Second"],
        },
        note: { type: "doc", content: [para("From the template")] },
      },
      userId,
    );
    createdTemplates.add(template.id);

    const { card, createdProject } = await createCard(
      prisma,
      input({ projectName: `From template ${run}`, templateId: template.id }),
      userId,
    );
    expect(createdProject).toBe(true);
    createdProjects.add(card.projectId);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: card.projectId },
      include: { labels: true, members: true, note: true },
    });
    expect(project).toMatchObject({ statusId: statusB, templateId: template.id });
    expect(project.labels.map((l) => l.labelId)).toEqual([labelId]); // the deleted label is ignored
    expect(project.members.map((m) => m.userId)).toEqual([userId]);
    const note = JSON.stringify(project.note!.json);
    expect(note).toContain("From the template");
    expect(note).toContain("Second");
    expect(project.note!.yState).toBeNull();

    // An explicit choice beats the template.
    const explicit = await createCard(
      prisma,
      input({ projectName: `Explicit ${run}`, templateId: template.id, statusId: statusA }),
      userId,
    );
    createdProjects.add(explicit.card.projectId);
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: explicit.card.projectId } })).statusId,
    ).toBe(statusA);

    // Deleting the template keeps the projects made from it.
    await deleteTemplate(prisma, template.id);
    expect(
      (await prisma.project.findUniqueOrThrow({ where: { id: card.projectId } })).templateId,
    ).toBeNull();
  });

  it("refuses an unknown template", async () => {
    await expect(
      createCard(prisma, input({ projectName: `Nope ${run}`, templateId: "missing" }), userId),
    ).rejects.toMatchObject({ status: 404 });
    expect(await prisma.project.count({ where: { name: `Nope ${run}` } })).toBe(0);
  });
});

describe("cloning a project", () => {
  it("copies settings and the note, duplicating the files so the copy owns them", async () => {
    const { card } = await createCard(
      prisma,
      input({ projectName: `Clone ${run}`, cloneFromProjectId: sourceId }),
      userId,
      { storage },
    );
    createdProjects.add(card.projectId);
    const copy = await prisma.project.findUniqueOrThrow({
      where: { id: card.projectId },
      include: { labels: true, members: true, note: true, attachments: true },
    });
    expect(copy).toMatchObject({ clonedFromId: sourceId, color: "#abcdef", progress: 0 });
    expect(copy.labels.map((l) => l.labelId)).toEqual([labelId]);
    expect(copy.members.map((m) => m.userId)).toEqual([userId]);

    const [file] = copy.attachments;
    expect(file!.id).not.toBe(`src-att-${run}`);
    expect(file!.projectId).toBe(copy.id);
    expect([...collectAttachmentIds(copy.note!.json)]).toEqual([file!.id]);
    const bytes: Buffer[] = [];
    for await (const chunk of (await storage.open(file!.storageKey)).stream)
      bytes.push(chunk as Buffer);
    expect(Buffer.concat(bytes).equals(FILE)).toBe(true);

    // Independent: the source's own file is untouched and still the one its note points at.
    expect(
      collectAttachmentIds(
        (await prisma.noteDocument.findUniqueOrThrow({ where: { projectId: sourceId } })).json,
      ).has(`src-att-${run}`),
    ).toBe(true);
    await storage.open(`${sourceId}/src-att-${run}`);
  });

  it("can leave the note out, and refuses a missing source", async () => {
    const { card } = await createCard(
      prisma,
      input({ projectName: `Clone bare ${run}`, cloneFromProjectId: sourceId, cloneNote: false }),
      userId,
      { storage },
    );
    createdProjects.add(card.projectId);
    const copy = await prisma.project.findUniqueOrThrow({
      where: { id: card.projectId },
      include: { note: true, attachments: true },
    });
    expect(copy.attachments).toHaveLength(0);
    expect(copy.note?.json ?? null).toBeNull();

    await expect(
      createCard(
        prisma,
        input({ projectName: `Clone ghost ${run}`, cloneFromProjectId: "missing" }),
        userId,
        { storage },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("removes the copied files when the project cannot be created", async () => {
    const before = (await readdir(root, { recursive: true })).length;
    // Same name as the source: the transaction fails after the files were copied.
    await expect(
      createCard(
        prisma,
        input({ projectName: `Source ${run}`, cloneFromProjectId: sourceId }),
        userId,
        {
          storage,
        },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await readdir(root, { recursive: true })).length).toBe(before);
  });
});
