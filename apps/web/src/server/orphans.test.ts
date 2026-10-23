import { createPrismaClient } from "@jakab/db";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupOrphanAttachments, collectAttachmentIds } from "./orphans";
import type { StorageDriver } from "./storage";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const removedKeys: string[] = [];
const storage: StorageDriver = {
  put: async () => ({ size: 0, sha256: "" }),
  open: async () => ({ stream: Readable.from([]), size: 0 }),
  remove: async (key) => void removedKeys.push(key),
};

const embed = (attachmentId: string) => ({ type: "fileEmbed", attrs: { attachmentId } });
const doc = (...ids: string[]) => ({ type: "doc", content: ids.map(embed) });

let projectId: string;
let busyId: string;
let statusId: string;
let templateId: string;
const ids = {
  inNote: `a-note-${run}`,
  inVersion: `a-version-${run}`,
  orphan: `a-orphan-${run}`,
  recent: `a-recent-${run}`,
  inTemplate: `a-template-${run}`,
  inOldVersion: `a-old-version-${run}`,
  busyOrphan: `a-busy-orphan-${run}`,
};

beforeAll(async () => {
  statusId = (
    await prisma.status.create({ data: { name: `O ${run}`, color: "#111111", order: 94 } })
  ).id;
  const name = `Orphans ${run}`;
  projectId = (
    await prisma.project.create({
      data: { name, nameNormalized: name.toLowerCase(), statusId, createdById: "u" },
    })
  ).id;
  const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const attachment = (id: string, createdAt: Date) => ({
    id,
    projectId,
    originalName: `${id}.txt`,
    mime: "text/plain",
    size: 1,
    sha256: "x",
    storageKey: `${projectId}/${id}`,
    uploadedBy: "u",
    createdAt,
  });
  await prisma.attachment.createMany({
    data: [
      attachment(ids.inNote, old),
      attachment(ids.inVersion, old),
      attachment(ids.orphan, old),
      attachment(ids.recent, new Date()),
    ],
  });
  await prisma.noteDocument.create({ data: { projectId, json: doc(ids.inNote) } });
  await prisma.noteVersion.create({
    data: { projectId, yState: Buffer.from([]), json: doc(ids.inVersion), reason: "auto" },
  });

  // A project with more versions than one reading block, the last of which holds a file.
  const busyName = `Orphans busy ${run}`;
  busyId = (
    await prisma.project.create({
      data: { name: busyName, nameNormalized: busyName.toLowerCase(), statusId, createdById: "u" },
    })
  ).id;
  const busyFile = (id: string) => ({
    ...attachment(id, old),
    projectId: busyId,
    storageKey: `${busyId}/${id}`,
  });
  await prisma.attachment.createMany({
    data: [busyFile(ids.inTemplate), busyFile(ids.inOldVersion), busyFile(ids.busyOrphan)],
  });
  await prisma.noteVersion.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      projectId: busyId,
      yState: Buffer.from([]),
      json: i === 119 ? doc(ids.inOldVersion) : doc(),
      reason: "auto" as const,
      createdAt: new Date(Date.now() - (200 - i) * 60_000),
    })),
  });
  templateId = (
    await prisma.template.create({
      data: {
        name: `Orphans template ${run}`,
        defaults: {},
        noteJson: doc(ids.inTemplate),
        createdBy: "u",
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.template.deleteMany({ where: { id: templateId } });
  await prisma.project.deleteMany({ where: { id: { in: [projectId, busyId] } } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.$disconnect();
});

describe("collectAttachmentIds", () => {
  it("finds embeds at any depth", () => {
    const nested = { type: "doc", content: [{ type: "bulletList", content: [embed("deep")] }] };
    expect([...collectAttachmentIds([doc("a"), nested])].sort()).toEqual(["a", "deep"]);
    expect(collectAttachmentIds(null).size).toBe(0);
  });
});

describe("cleanupOrphanAttachments", () => {
  it("removes only old files that no note, version or template refers to", async () => {
    const result = await cleanupOrphanAttachments(prisma, storage, { olderThanDays: 14 });
    expect(result.removed).toBeGreaterThanOrEqual(1);
    expect(removedKeys).toContain(`${projectId}/${ids.orphan}`);
    expect(removedKeys).not.toContain(`${projectId}/${ids.inNote}`);
    expect(removedKeys).not.toContain(`${projectId}/${ids.inVersion}`);
    expect(removedKeys).not.toContain(`${projectId}/${ids.recent}`);

    const left = await prisma.attachment.findMany({
      where: { projectId },
      select: { id: true },
      orderBy: { id: "asc" },
    });
    expect(left.map((a) => a.id).sort()).toEqual([ids.inNote, ids.inVersion, ids.recent].sort());
  });

  it("looks through every saved version and every template, not just the latest ones", async () => {
    await cleanupOrphanAttachments(prisma, storage, { olderThanDays: 14 });
    expect(removedKeys).toContain(`${busyId}/${ids.busyOrphan}`);
    expect(removedKeys).not.toContain(`${busyId}/${ids.inOldVersion}`);
    expect(removedKeys).not.toContain(`${busyId}/${ids.inTemplate}`);
    const left = await prisma.attachment.findMany({
      where: { projectId: busyId },
      select: { id: true },
    });
    expect(left.map((a) => a.id).sort()).toEqual([ids.inOldVersion, ids.inTemplate].sort());
  });
});
