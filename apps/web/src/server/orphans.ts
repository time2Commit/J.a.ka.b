import type { PrismaClient } from "@jakab/db";
import type { StorageDriver } from "./storage";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Collects every `fileEmbed` attachment id found anywhere in an editor JSON document. */
export function collectAttachmentIds(node: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(node)) {
    for (const child of node) collectAttachmentIds(child, found);
  } else if (node && typeof node === "object") {
    const { type, attrs, content } = node as {
      type?: string;
      attrs?: { attachmentId?: unknown };
      content?: unknown;
    };
    if (type === "fileEmbed" && typeof attrs?.attachmentId === "string") {
      found.add(attrs.attachmentId);
    }
    collectAttachmentIds(content, found);
  }
  return found;
}

/** Saved versions of a note are read in blocks of this many, never all at once. */
const VERSION_BATCH = 50;

/** Ids of the files that the current note and every saved version of a project embed. */
async function embeddedIn(db: PrismaClient, projectId: string) {
  const found = new Set<string>();
  const note = await db.noteDocument.findUnique({ where: { projectId }, select: { json: true } });
  collectAttachmentIds(note?.json, found);
  for (let cursor: string | undefined; ;) {
    const batch = await db.noteVersion.findMany({
      where: { projectId },
      select: { id: true, json: true },
      orderBy: { id: "asc" },
      take: VERSION_BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    for (const { json } of batch) collectAttachmentIds(json, found);
    if (batch.length < VERSION_BATCH) return found;
    cursor = batch[batch.length - 1]!.id;
  }
}

/**
 * Removes files that nothing refers to any more: uploaded more than `olderThanDays` ago and not
 * embedded in the current note, in any saved version, or in a template. A file that a version
 * still references is never touched, so restoring an old version always finds its files.
 * One project is examined at a time, so the memory used does not grow with the whole history.
 */
export async function cleanupOrphanAttachments(
  db: PrismaClient,
  storage: StorageDriver,
  options: { olderThanDays: number; now?: Date },
): Promise<{ removed: number }> {
  const cutoff = new Date((options.now ?? new Date()).getTime() - options.olderThanDays * DAY_MS);
  const candidates = await db.attachment.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true, projectId: true, storageKey: true },
  });
  if (candidates.length === 0) return { removed: 0 };

  // Templates are few and small: their embeds are read once.
  const inTemplates = new Set<string>();
  for (const { noteJson } of await db.template.findMany({ select: { noteJson: true } })) {
    collectAttachmentIds(noteJson, inTemplates);
  }

  const byProject = new Map<string, typeof candidates>();
  for (const attachment of candidates) {
    byProject.set(attachment.projectId, [
      ...(byProject.get(attachment.projectId) ?? []),
      attachment,
    ]);
  }

  let removed = 0;
  for (const [projectId, files] of byProject) {
    const referenced = await embeddedIn(db, projectId);
    for (const attachment of files) {
      if (referenced.has(attachment.id) || inTemplates.has(attachment.id)) continue;
      // Row first: a file without a row is harmless, a row without a file is a broken link.
      await db.attachment.delete({ where: { id: attachment.id } });
      await storage.remove(attachment.storageKey);
      removed++;
    }
  }
  return { removed };
}
