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

/**
 * Removes files that nothing refers to any more: uploaded more than `olderThanDays` ago and not
 * embedded in the current note, in any saved version, or in a template. A file that a version
 * still references is never touched, so restoring an old version always finds its files.
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

  const projectIds = [...new Set(candidates.map((a) => a.projectId))];
  const [notes, versions, templates] = await Promise.all([
    db.noteDocument.findMany({ where: { projectId: { in: projectIds } }, select: { json: true } }),
    db.noteVersion.findMany({ where: { projectId: { in: projectIds } }, select: { json: true } }),
    db.template.findMany({ select: { noteJson: true } }),
  ]);
  const referenced = new Set<string>();
  for (const { json } of [...notes, ...versions]) collectAttachmentIds(json, referenced);
  for (const { noteJson } of templates) collectAttachmentIds(noteJson, referenced);

  let removed = 0;
  for (const attachment of candidates) {
    if (referenced.has(attachment.id)) continue;
    // Row first: a file without a row is harmless, a row without a file is a broken link.
    await db.attachment.delete({ where: { id: attachment.id } });
    await storage.remove(attachment.storageKey);
    removed++;
  }
  return { removed };
}
