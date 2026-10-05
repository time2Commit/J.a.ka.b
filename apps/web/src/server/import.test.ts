import { createPrismaClient } from "@jakab/db";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { exportBoard, exportProject } from "./export";
import { applyArchive, parseArchive, previewArchive, type ImportOptions } from "./import";
import { FileSystemStorage } from "./storage";
import { openZipBuffer, openZipFile } from "./zip-reader";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const FILE = Buffer.from("attachment bytes");
const hash = async (password: string) => `hashed:${password}`;
const names = {
  project: `Roundtrip ${run}`,
  status: `St ${run}`,
  label: `Lb ${run}`,
  email: `round.${run}@example.com`,
  template: `Tpl ${run}`,
};

let root: string;
let storage: FileSystemStorage;
let actorId: string;
let sourceProjectId: string;
const cleanup = { projects: new Set<string>(), users: new Set<string>() };

const toBuffer = async (stream: Readable) => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
};
const opts = (patch: Partial<ImportOptions> = {}): ImportOptions => ({
  conflict: "skip",
  createMissingUsers: false,
  applyWorkspace: false,
  ...patch,
});
const env = () => ({ actorId, maxFileBytes: 1024 * 1024, hashPassword: hash });

async function exportedBoard(includeVersions = true) {
  const { stream } = await exportBoard(prisma, storage, { includeVersions });
  return openZipBuffer(await toBuffer(stream));
}

/** Removes the exported data so the archive can be imported "on a fresh instance". */
async function wipeSource() {
  await prisma.project.deleteMany({ where: { id: sourceProjectId } });
  await prisma.label.deleteMany({ where: { name: names.label } });
  await prisma.status.deleteMany({ where: { name: names.status } });
  await prisma.user.deleteMany({ where: { email: names.email } });
  await prisma.template.deleteMany({ where: { name: names.template } });
}

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "jakab-import-"));
  storage = new FileSystemStorage(root);
  actorId = (
    await prisma.user.create({
      data: {
        id: `u-actor-${run}`,
        name: "Importer",
        email: `actor.${run}@example.com`,
        role: "admin",
      },
    })
  ).id;
  cleanup.users.add(actorId);

  const status = await prisma.status.create({
    data: { name: names.status, color: "#123456", order: 92 },
  });
  const label = await prisma.label.create({ data: { name: names.label, color: "#654321" } });
  const person = await prisma.user.create({
    data: { id: `u-person-${run}`, name: "Anna Person", email: names.email, role: "member" },
  });
  const project = await prisma.project.create({
    data: {
      name: names.project,
      nameNormalized: names.project.toLowerCase(),
      statusId: status.id,
      progress: 55,
      color: "#abcdef",
      createdById: person.id,
      labels: { create: { labelId: label.id } },
      members: { create: { userId: person.id } },
    },
  });
  sourceProjectId = project.id;
  await prisma.template.create({
    data: {
      name: names.template,
      createdBy: person.id,
      defaults: {
        statusId: status.id,
        labelIds: [label.id],
        memberIds: [person.id],
        durationMin: 90,
        checklist: ["Step one"],
      },
      noteJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "mention", attrs: { id: person.id, label: "Anna Person" } },
              { type: "text", text: " template text" },
            ],
          },
        ],
      },
    },
  });
  const attachmentId = `att-${run}`;
  await storage.put(`${project.id}/${attachmentId}`, Readable.from([FILE]), 1024);
  const { sha256 } = await storage.put(
    `${project.id}/${attachmentId}`,
    Readable.from([FILE]),
    1024,
  );
  await prisma.attachment.create({
    data: {
      id: attachmentId,
      projectId: project.id,
      originalName: "doc.txt",
      mime: "text/plain",
      size: FILE.length,
      sha256,
      storageKey: `${project.id}/${attachmentId}`,
      uploadedBy: person.id,
    },
  });
  const note = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "mention", attrs: { id: person.id, label: "Anna Person" } },
          { type: "text", text: " wrote this" },
        ],
      },
      {
        type: "fileEmbed",
        attrs: { attachmentId, name: "doc.txt", mime: "text/plain", size: FILE.length },
      },
    ],
  };
  await prisma.noteDocument.create({ data: { projectId: project.id, json: note } });
  await prisma.noteVersion.create({
    data: {
      projectId: project.id,
      yState: Buffer.from([]),
      json: note,
      authors: [person.id],
      reason: "manual",
      label: "Milestone",
    },
  });
  await prisma.card.create({
    data: {
      projectId: project.id,
      title: "Kick-off",
      start: new Date("2026-04-06T09:00:00Z"),
      end: new Date("2026-04-06T11:00:00Z"),
      createdById: person.id,
      members: { create: { userId: person.id } },
      labels: { create: { labelId: label.id } },
      progressOverride: 20,
    },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { name: { startsWith: names.project } } });
  await prisma.label.deleteMany({ where: { name: names.label } });
  await prisma.status.deleteMany({ where: { name: names.status } });
  await prisma.user.deleteMany({ where: { email: names.email } });
  await prisma.template.deleteMany({ where: { name: names.template } });
  await prisma.user.deleteMany({ where: { id: { in: [...cleanup.users] } } });
  await prisma.$disconnect();
  await rm(root, { recursive: true, force: true });
});

describe("import round trip", () => {
  it("previews, then recreates a project on an instance that has none of its data", async () => {
    const zip = await exportedBoard();
    const parsed = await parseArchive(zip);
    await wipeSource();

    const preview = await previewArchive(prisma, parsed);
    const entry = preview.projects.find((p) => p.name === names.project)!;
    expect(entry).toMatchObject({ exists: false, cards: 1, attachments: 1, hasVersions: true });
    expect(preview.newStatuses).toContain(names.status);
    expect(preview.newLabels).toContain(names.label);
    expect(preview.people.find((p) => p.email === names.email)).toMatchObject({ exists: false });
    expect(preview.templates).toContainEqual({ name: names.template, exists: false });

    const result = await applyArchive(
      prisma,
      storage,
      zip,
      parsed,
      opts({ createMissingUsers: true, slugs: [entry.slug] }),
      env(),
    );
    expect(result.failed).toEqual([]);
    expect(result.imported).toHaveLength(1);
    expect(result.createdUsers).toHaveLength(1);
    expect(result.createdUsers[0]).toMatchObject({ email: names.email, name: "Anna Person" });
    // The temporary password is returned once and only its hash is stored.
    const created = await prisma.user.findUniqueOrThrow({
      where: { email: names.email },
      include: { accounts: true },
    });
    expect(created.accounts[0]!.password).toBe(`hashed:${result.createdUsers[0]!.password}`);

    const imported = await prisma.project.findUniqueOrThrow({
      where: { id: result.imported[0]!.projectId },
      include: {
        status: true,
        labels: { include: { label: true } },
        members: true,
        cards: { include: { members: true, labels: true } },
        attachments: true,
        note: true,
        versions: true,
      },
    });
    expect(imported).toMatchObject({ name: names.project, progress: 55, color: "#abcdef" });
    expect(imported.status.name).toBe(names.status);
    expect(imported.labels.map((l) => l.label.name)).toEqual([names.label]);
    expect(imported.members.map((m) => m.userId)).toEqual([created.id]);
    expect(imported.cards).toHaveLength(1);
    expect(imported.cards[0]).toMatchObject({ title: "Kick-off", progressOverride: 20 });
    expect(imported.cards[0]!.members.map((m) => m.userId)).toEqual([created.id]);
    expect(imported.cards[0]!.start.toISOString()).toBe("2026-04-06T09:00:00.000Z");

    // The file was copied and the note now points at the new attachment and the new person.
    const [attachment] = imported.attachments;
    expect(attachment!.id).not.toBe(`att-${run}`);
    const stored = await toBuffer((await storage.open(attachment!.storageKey)).stream);
    expect(stored.equals(FILE)).toBe(true);
    const noteJson = JSON.stringify(imported.note!.json);
    expect(noteJson).toContain(`"attachmentId":"${attachment!.id}"`);
    expect(noteJson).not.toContain(`att-${run}`);
    expect(noteJson).toContain(`"id":"${created.id}"`);
    expect(imported.note!.yState).toBeNull();

    expect(imported.versions).toMatchObject([
      { reason: "manual", label: "Milestone", authors: [created.id] },
    ]);
    expect(JSON.stringify(imported.versions[0]!.json)).toContain(attachment!.id);
    cleanup.projects.add(imported.id);

    // Templates travel with the board, with their catalog entries and people matched again.
    expect(result.templatesImported).toBeGreaterThanOrEqual(1);
    const template = await prisma.template.findUniqueOrThrow({ where: { name: names.template } });
    expect(template.defaults).toMatchObject({
      statusId: imported.statusId,
      labelIds: [imported.labels[0]!.labelId],
      memberIds: [created.id],
      durationMin: 90,
      checklist: ["Step one"],
    });
    expect(JSON.stringify(template.noteJson)).toContain(`"id":"${created.id}"`);
    zip.close();
  });

  it("applies the conflict choice to a project that already exists", async () => {
    const zip = await exportedBoard(false);
    const parsed = await parseArchive(zip);
    const slug = parsed.projects.find((p) => p.data.name === names.project)!.slug;
    const existing = await prisma.project.findFirstOrThrow({ where: { name: names.project } });

    const skipped = await applyArchive(
      prisma,
      storage,
      zip,
      parsed,
      opts({ slugs: [slug] }),
      env(),
    );
    expect(skipped.skipped).toHaveLength(1);
    expect(skipped.imported).toHaveLength(0);

    const renamed = await applyArchive(
      prisma,
      storage,
      zip,
      parsed,
      opts({ conflict: "rename", slugs: [slug] }),
      env(),
    );
    expect(renamed.imported[0]).toMatchObject({
      name: `${names.project} (imported)`,
      renamedFrom: names.project,
    });
    expect(await prisma.project.count({ where: { id: existing.id } })).toBe(1);

    const oldKeys = (await prisma.attachment.findMany({ where: { projectId: existing.id } })).map(
      (a) => a.storageKey,
    );
    const replaced = await applyArchive(
      prisma,
      storage,
      zip,
      parsed,
      opts({ conflict: "replace", slugs: [slug] }),
      env(),
    );
    expect(replaced.imported[0]!.name).toBe(names.project);
    expect(await prisma.project.count({ where: { id: existing.id } })).toBe(0);
    expect(await prisma.project.count({ where: { name: names.project } })).toBe(1);
    // The replaced project's files are gone, the new one's are in place.
    for (const key of oldKeys) await expect(storage.open(key)).rejects.toThrow();
    zip.close();
  });

  it("fails one project without side effects when its file does not match the checksum", async () => {
    const { stream } = await exportProject(
      prisma,
      storage,
      (await prisma.project.findFirstOrThrow({ where: { name: names.project } })).id,
      { includeVersions: false },
    );
    const zip = await openZipBuffer(await toBuffer(stream));
    const parsed = await parseArchive(zip);
    parsed.projects[0]!.data.attachments[0]!.sha256 = "0".repeat(64);
    const before = (await readdir(root, { recursive: true })).length;

    const result = await applyArchive(
      prisma,
      storage,
      zip,
      parsed,
      opts({ conflict: "rename" }),
      env(),
    );
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]!.message).toContain("Checksum mismatch");
    expect(await prisma.project.count({ where: { name: `${names.project} (imported 2)` } })).toBe(
      0,
    );
    expect((await readdir(root, { recursive: true })).length).toBe(before);
    zip.close();
  });
});

describe("archives on disk", () => {
  it("can be read after the directory listing (the upload is a file, not a buffer)", async () => {
    const { stream } = await exportBoard(prisma, storage, { includeVersions: true });
    const file = path.join(root, "board.zip");
    await writeFile(file, await toBuffer(stream));
    const zip = await openZipFile(file);
    const parsed = await parseArchive(zip);
    expect(parsed.manifest.kind).toBe("board");
    const [first] = parsed.projects.filter((p) => p.data.attachments.length > 0);
    const bytes = await toBuffer(
      await zip.openStream(`projects/${first!.slug}/${first!.data.attachments[0]!.file}`),
    );
    expect(bytes.length).toBeGreaterThan(0);
    zip.close();
  });
});

describe("parseArchive", () => {
  it("rejects archives that are not backups", async () => {
    const yazl = (await import("yazl")).default;
    const make = async (files: Record<string, string>) => {
      const z = new yazl.ZipFile();
      for (const [name, content] of Object.entries(files)) z.addBuffer(Buffer.from(content), name);
      z.end();
      return openZipBuffer(await toBuffer(z.outputStream as Readable));
    };
    await expect(parseArchive(await make({ "readme.txt": "hi" }))).rejects.toMatchObject({
      status: 400,
    });
    await expect(parseArchive(await make({ "manifest.json": "{nope" }))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      parseArchive(
        await make({
          "manifest.json": JSON.stringify({
            format: "jakab-backup",
            version: 99,
            kind: "project",
            exportedAt: new Date().toISOString(),
            projects: [],
          }),
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    // A folder name that tries to leave the project directory is refused.
    await expect(
      parseArchive(
        await make({
          "manifest.json": JSON.stringify({
            format: "jakab-backup",
            version: 1,
            kind: "project",
            exportedAt: new Date().toISOString(),
            projects: [{ slug: "../evil", name: "x" }],
          }),
        }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
