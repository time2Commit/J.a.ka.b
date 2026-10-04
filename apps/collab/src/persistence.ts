import type { PrismaClient } from "@jakab/db";
import { ydocToJson } from "@jakab/editor";
import * as Y from "yjs";

/** Persisted Yjs state of a project note, or null when the note was never edited. */
export async function loadNote(db: PrismaClient, projectId: string): Promise<Uint8Array | null> {
  const note = await db.noteDocument.findUnique({
    where: { projectId },
    select: { yState: true },
  });
  return note?.yState ? new Uint8Array(note.yState) : null;
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
