import type { Prisma, PrismaClient } from "@jakab/db";
import { randomUUID } from "node:crypto";
import { notFound } from "./errors";
import { filterFileEmbeds, mapNoteIds } from "./note-json";
import { collectAttachmentIds } from "./orphans";
import type { StorageDriver } from "./storage";

export interface PreparedClone {
  labelIds: string[];
  memberIds: string[];
  color: string | null;
  /** Note of the copy, with attachment references pointing at the copied files; null when empty. */
  note: Prisma.InputJsonValue | null;
  attachments: Prisma.AttachmentCreateWithoutProjectInput[];
  /** Storage keys written so far: remove them if the project is not created after all. */
  storedKeys: string[];
}

/**
 * Reads the source project and physically duplicates the attachments its note refers to, so the
 * copy owns its files (deleting one project never breaks the other). Runs before the database
 * transaction that creates the project; the caller removes `storedKeys` if that transaction fails.
 */
export async function prepareClone(
  db: PrismaClient,
  storage: StorageDriver,
  input: { sourceId: string; newProjectId: string; userId: string; includeNote: boolean },
): Promise<PreparedClone> {
  const source = await db.project.findUnique({
    where: { id: input.sourceId },
    include: {
      labels: true,
      members: true,
      attachments: true,
      note: { select: { json: true } },
    },
  });
  if (!source) throw notFound("Project to clone");

  const prepared: PreparedClone = {
    labelIds: source.labels.map((l) => l.labelId),
    memberIds: source.members.map((m) => m.userId),
    color: source.color,
    note: null,
    attachments: [],
    storedKeys: [],
  };
  const json = source.note?.json;
  if (!input.includeNote || !json) return prepared;

  const referenced = collectAttachmentIds(json);
  const idMap = new Map<string, string>();
  try {
    for (const attachment of source.attachments) {
      if (!referenced.has(attachment.id)) continue;
      const opened = await storage.open(attachment.storageKey).catch(() => null);
      if (!opened) continue; // bytes are gone: the embed is dropped below
      const id = randomUUID();
      const key = `${input.newProjectId}/${id}`;
      const { size, sha256 } = await storage.put(key, opened.stream, Number.MAX_SAFE_INTEGER);
      prepared.storedKeys.push(key);
      idMap.set(attachment.id, id);
      prepared.attachments.push({
        id,
        originalName: attachment.originalName,
        mime: attachment.mime,
        size,
        sha256,
        storageKey: key,
        uploadedBy: input.userId,
      });
    }
  } catch (error) {
    await Promise.all(prepared.storedKeys.map((key) => storage.remove(key).catch(() => undefined)));
    throw error;
  }

  const kept = filterFileEmbeds(json as object, new Set(idMap.keys()));
  prepared.note = mapNoteIds(kept, {
    attachment: (id) => idMap.get(id) ?? id,
  }) as Prisma.InputJsonValue;
  return prepared;
}
