import type { PrismaClient, VersionReason } from "@jakab/db";
import { canonicalJson, isEmptyDocument, NOTE_FIELD, jsonToYdoc, ydocToJson } from "@jakab/editor";
import * as Y from "yjs";

/** An automatic version is taken when at least this long has passed since the previous one. */
export const AUTO_VERSION_INTERVAL_MS = 10 * 60 * 1000;
/** Automatic versions are all kept for this long; older ones are thinned to one per day. */
export const KEEP_ALL_AUTO_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface VersionSummary {
  id: string;
  reason: VersionReason;
  createdAt: Date;
}

/**
 * Ids of automatic versions to delete: every one is kept for `keepAllDays`, after that only the
 * newest of each UTC day. Manual and pre-restore versions are never selected.
 */
export function selectVersionsToPrune(
  versions: VersionSummary[],
  now: Date,
  keepAllDays = KEEP_ALL_AUTO_DAYS,
): string[] {
  const cutoff = now.getTime() - keepAllDays * DAY_MS;
  const newestFirst = versions
    .filter((v) => v.reason === "auto" && v.createdAt.getTime() < cutoff)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const seenDays = new Set<string>();
  const prune: string[] = [];
  for (const version of newestFirst) {
    const day = version.createdAt.toISOString().slice(0, 10);
    if (seenDays.has(day)) prune.push(version.id);
    else seenDays.add(day);
  }
  return prune;
}

export async function createVersion(
  db: PrismaClient,
  input: {
    projectId: string;
    doc: Y.Doc;
    reason: VersionReason;
    authors: string[];
    userId: string | null;
    label?: string | null;
  },
) {
  return db.noteVersion.create({
    data: {
      projectId: input.projectId,
      yState: Buffer.from(Y.encodeStateAsUpdate(input.doc)),
      json: ydocToJson(input.doc),
      authors: input.authors,
      reason: input.reason,
      label: input.label ?? null,
      createdBy: input.userId,
    },
    select: { id: true, createdAt: true },
  });
}

export async function lastVersion(db: PrismaClient, projectId: string) {
  return db.noteVersion.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, json: true },
  });
}

/**
 * Takes an automatic version when the note has real changes since the last version and either
 * the interval has passed or `force` is set (end of an editing session). Returns true if created.
 */
export async function maybeAutoVersion(
  db: PrismaClient,
  input: {
    projectId: string;
    doc: Y.Doc;
    authors: string[];
    userId: string | null;
    force: boolean;
    now?: Date;
  },
): Promise<boolean> {
  const now = input.now ?? new Date();
  const json = ydocToJson(input.doc);
  const previous = await lastVersion(db, input.projectId);

  if (!previous && isEmptyDocument(json)) return false;
  if (previous) {
    if (!input.force && now.getTime() - previous.createdAt.getTime() < AUTO_VERSION_INTERVAL_MS) {
      return false;
    }
    if (canonicalJson(previous.json) === canonicalJson(json)) return false;
  }

  await createVersion(db, {
    projectId: input.projectId,
    doc: input.doc,
    reason: "auto",
    authors: input.authors,
    userId: input.userId,
  });
  await pruneVersions(db, input.projectId, now);
  return true;
}

export async function pruneVersions(db: PrismaClient, projectId: string, now = new Date()) {
  const autos = await db.noteVersion.findMany({
    where: { projectId, reason: "auto" },
    select: { id: true, reason: true, createdAt: true },
  });
  const ids = selectVersionsToPrune(autos, now);
  if (ids.length > 0) await db.noteVersion.deleteMany({ where: { id: { in: ids } } });
  return ids.length;
}

/** Replaces the whole content of a live note with the one stored in a version (one transaction). */
export function replaceNoteContent(doc: Y.Doc, json: Parameters<typeof jsonToYdoc>[0]) {
  const source = jsonToYdoc(json).getXmlFragment(NOTE_FIELD);
  const target = doc.getXmlFragment(NOTE_FIELD);
  doc.transact(() => {
    target.delete(0, target.length);
    target.insert(
      0,
      source.toArray().map((node) => node.clone() as Y.XmlElement | Y.XmlText),
    );
  });
}
