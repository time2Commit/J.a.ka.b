import type { PrismaClient } from "@jakab/db";
import { notFound } from "./errors";

export interface VersionAuthor {
  id: string;
  name: string;
  avatarColor: string;
}

export interface VersionDto {
  id: string;
  reason: "auto" | "manual" | "pre_restore";
  label: string | null;
  createdAt: string;
  authors: VersionAuthor[];
}

async function resolveAuthors(db: PrismaClient, ids: string[]) {
  if (ids.length === 0) return new Map<string, VersionAuthor>();
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, avatarColor: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

/** Newest first. Authors that no longer exist are dropped. */
export async function listVersions(db: PrismaClient, projectId: string): Promise<VersionDto[]> {
  const versions = await db.noteVersion.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    select: { id: true, reason: true, label: true, createdAt: true, authors: true },
  });
  const users = await resolveAuthors(db, [...new Set(versions.flatMap((v) => v.authors))]);
  return versions.map((v) => ({
    id: v.id,
    reason: v.reason,
    label: v.label,
    createdAt: v.createdAt.toISOString(),
    authors: v.authors.flatMap((id) => users.get(id) ?? []),
  }));
}

/** One version with its readable content (editor JSON), for preview and comparison. */
export async function getVersion(db: PrismaClient, projectId: string, versionId: string) {
  const version = await db.noteVersion.findFirst({
    where: { id: versionId, projectId },
    select: { id: true, reason: true, label: true, createdAt: true, authors: true, json: true },
  });
  if (!version) throw notFound("Version");
  const users = await resolveAuthors(db, version.authors);
  return {
    id: version.id,
    reason: version.reason,
    label: version.label,
    createdAt: version.createdAt.toISOString(),
    authors: version.authors.flatMap((id) => users.get(id) ?? []),
    json: version.json,
  };
}
