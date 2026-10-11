import type { Prisma, PrismaClient } from "@jakab/db";
import {
  FOLDER_MAX_DEPTH,
  type FolderCreateInput,
  type FolderKind,
  type FolderUpdateInput,
} from "@jakab/shared";
import { conflict, notFound } from "./errors";
import { notifyBoardChanged } from "./notify";

type Db = PrismaClient | Prisma.TransactionClient;

export interface FolderDto {
  id: string;
  name: string;
  parentId: string | null;
}

/** The folders of one tree: the projects' or the templates'. */
export async function listFolders(db: Db, kind: FolderKind = "project"): Promise<FolderDto[]> {
  return db.projectFolder.findMany({
    where: { kind },
    select: { id: true, name: true, parentId: true },
    orderBy: { name: "asc" },
  });
}

/** Folder ids from `id` up to the top (the folder itself first). Stops on a broken loop. */
async function ancestry(db: Db, id: string | null): Promise<string[]> {
  const chain: string[] = [];
  let current = id;
  while (current && !chain.includes(current)) {
    chain.push(current);
    const folder = await db.projectFolder.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    if (!folder) throw notFound("Folder");
    current = folder.parentId;
  }
  return chain;
}

/** Number of levels below `id` (a folder without subfolders has height 1). */
async function height(db: Db, id: string): Promise<number> {
  const children = await db.projectFolder.findMany({
    where: { parentId: id },
    select: { id: true },
  });
  const below = await Promise.all(children.map((c) => height(db, c.id)));
  return 1 + Math.max(0, ...below);
}

async function assertNameFree(
  db: Db,
  kind: FolderKind,
  name: string,
  parentId: string | null,
  exceptId?: string,
) {
  const siblings = await db.projectFolder.findMany({
    where: { kind, parentId, ...(exceptId && { id: { not: exceptId } }) },
    select: { name: true },
  });
  const wanted = name.toLocaleLowerCase();
  if (siblings.some((s) => s.name.toLocaleLowerCase() === wanted)) {
    throw conflict("A folder with this name already exists here");
  }
}

/** The parent must be a folder of the same tree. */
async function assertSameKind(db: Db, kind: FolderKind, parentId: string | null) {
  if (parentId === null) return;
  const parent = await db.projectFolder.findUnique({
    where: { id: parentId },
    select: { kind: true },
  });
  if (!parent) throw notFound("Folder");
  if (parent.kind !== kind) throw conflict("A folder cannot be put in another kind of folder");
}

export async function createFolder(db: PrismaClient, input: FolderCreateInput) {
  const kind = input.kind ?? "project";
  const parentId = input.parentId ?? null;
  return db.$transaction(async (tx) => {
    await assertSameKind(tx, kind, parentId);
    const depth = (await ancestry(tx, parentId)).length;
    if (depth >= FOLDER_MAX_DEPTH) throw conflict("Folders are nested too deeply");
    await assertNameFree(tx, kind, input.name, parentId);
    const folder = await tx.projectFolder.create({
      data: { kind, name: input.name, parentId },
      select: { id: true, name: true, parentId: true },
    });
    await notifyBoardChanged(tx, "folder", folder.id);
    return folder;
  });
}

/** Renames and/or moves a folder (with everything in it). */
export async function updateFolder(db: PrismaClient, id: string, input: FolderUpdateInput) {
  return db.$transaction(async (tx) => {
    const existing = await tx.projectFolder.findUnique({ where: { id } });
    if (!existing) throw notFound("Folder");
    const parentId = input.parentId === undefined ? existing.parentId : input.parentId;
    const name = input.name ?? existing.name;

    const kind = existing.kind as FolderKind;
    if (parentId !== existing.parentId) {
      await assertSameKind(tx, kind, parentId);
      const above = await ancestry(tx, parentId);
      if (above.includes(id)) throw conflict("A folder cannot be moved into itself");
      if (above.length + (await height(tx, id)) > FOLDER_MAX_DEPTH) {
        throw conflict("Folders are nested too deeply");
      }
    }
    if (name !== existing.name || parentId !== existing.parentId) {
      await assertNameFree(tx, kind, name, parentId, id);
    }
    const folder = await tx.projectFolder.update({
      where: { id },
      data: { name, parentId },
      select: { id: true, name: true, parentId: true },
    });
    await notifyBoardChanged(tx, "folder", id);
    return folder;
  });
}

/**
 * Deletes a folder. Its subfolders and projects are never lost: they move up to the parent
 * folder (or to the top level).
 */
export async function deleteFolder(db: PrismaClient, id: string) {
  await db.$transaction(async (tx) => {
    const folder = await tx.projectFolder.findUnique({ where: { id } });
    if (!folder) throw notFound("Folder");
    const children = await tx.projectFolder.findMany({
      where: { parentId: id },
      select: { id: true, name: true },
    });
    for (const child of children) {
      // A subfolder that would clash with a sibling of the deleted folder gets a suffix.
      let name = child.name;
      for (let n = 2; ; n++) {
        try {
          await assertNameFree(tx, folder.kind as FolderKind, name, folder.parentId, child.id);
          break;
        } catch {
          name = `${child.name} (${n})`;
        }
      }
      await tx.projectFolder.update({
        where: { id: child.id },
        data: { parentId: folder.parentId, name },
      });
    }
    await tx.project.updateMany({ where: { folderId: id }, data: { folderId: folder.parentId } });
    await tx.template.updateMany({ where: { folderId: id }, data: { folderId: folder.parentId } });
    await tx.projectFolder.delete({ where: { id } });
    await notifyBoardChanged(tx, "folder", id);
  });
}

/** Checks that something can be put in this folder of the given tree (null = uncategorized). */
export async function assertFolderExists(db: Db, folderId: string | null, kind: FolderKind) {
  if (folderId === null) return;
  const folder = await db.projectFolder.findUnique({
    where: { id: folderId },
    select: { kind: true },
  });
  if (!folder || folder.kind !== kind) throw notFound("Folder");
}

/** Names of the folders from the top down to `folderId` ([] = uncategorized). */
export async function folderPath(db: Db, folderId: string | null): Promise<string[]> {
  const names: string[] = [];
  for (const id of await ancestry(db, folderId)) {
    const folder = await db.projectFolder.findUniqueOrThrow({
      where: { id },
      select: { name: true },
    });
    names.unshift(folder.name);
  }
  return names;
}

/** Finds or creates the folders of a path; returns the id of the last one (null for []). */
export async function ensureFolderPath(
  db: Db,
  path: string[],
  kind: FolderKind = "project",
): Promise<string | null> {
  let parentId: string | null = null;
  for (const name of path) {
    const siblings: { id: string; name: string }[] = await db.projectFolder.findMany({
      where: { kind, parentId },
      select: { id: true, name: true },
    });
    const found = siblings.find((s) => s.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    parentId = found
      ? found.id
      : (await db.projectFolder.create({ data: { kind, name, parentId }, select: { id: true } }))
          .id;
  }
  return parentId;
}

/** Folder id → names from the top of the tree down to it, for every folder. */
export async function folderPathMap(
  db: Db,
  kind: FolderKind = "project",
): Promise<Map<string, string[]>> {
  const folders = await db.projectFolder.findMany({
    where: { kind },
    select: { id: true, name: true, parentId: true },
  });
  const byId = new Map(folders.map((f) => [f.id, f]));
  const paths = new Map<string, string[]>();
  for (const folder of folders) {
    const path: string[] = [];
    const seen = new Set<string>();
    let current: (typeof folders)[number] | undefined = folder;
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      path.unshift(current.name);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    paths.set(folder.id, path);
  }
  return paths;
}
