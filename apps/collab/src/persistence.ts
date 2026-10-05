import type { PrismaClient } from "@jakab/db";
import { jsonToYdoc, ydocToJson } from "@jakab/editor";
import * as Y from "yjs";

/** Persisted Yjs state of a project note, or null when the note was never edited or filled. */
export async function loadNote(db: PrismaClient, projectId: string): Promise<Uint8Array | null> {
  const note = await db.noteDocument.findUnique({
    where: { projectId },
    select: { yState: true, json: true },
  });
  if (note?.yState) return new Uint8Array(note.yState);
  // A note created from content (import, template, clone) has JSON only: build the Yjs state now.
  if (note?.json) {
    return Y.encodeStateAsUpdate(jsonToYdoc(note.json as Parameters<typeof jsonToYdoc>[0]));
  }
  return null;
}

/** Writes the Yjs state plus a readable JSON copy (used by search and export). */
export async function storeNote(
  db: PrismaClient,
  projectId: string,
  doc: Y.Doc,
  userId: string | null,
) {
  const yState = Buffer.from(Y.encodeStateAsUpdate(doc));
  const json = ydocToJson(doc);
  await db.noteDocument.upsert({
    where: { projectId },
    create: { projectId, yState, json, updatedBy: userId },
    update: { yState, json, updatedBy: userId },
  });
}
