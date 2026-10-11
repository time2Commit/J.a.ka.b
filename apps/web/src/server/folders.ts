import type { Prisma, PrismaClient } from "@jakab/db";
import { FOLDER_MAX_DEPTH, type FolderCreateInput, type FolderUpdateInput } from "@jakab/shared";
import { conflict, notFound } from "./errors";
import { notifyBoardChanged } from "./notify";

type Db = PrismaClient | Prisma.TransactionClient;

export interface FolderDto {
  id: string;
  name: string;
  parentId: string | null;
}

export async function listFolders(db: Db): Promise<FolderDto[]> {
  return db.projectFolder.findMany({
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

async function assertNameFree(db: Db, name: string, parentId: string | null, exceptId?: string) {
  const siblings = await db.projectFolder.findMany({
    where: { parentId, ...(exceptId && { id: { not: exceptId } }) },
    select: { name: true },
  });
  const wanted = name.toLocaleLowerCase();
  if (siblings.some((s) => s.name.toLocaleLowerCase() === wanted)) {
    throw conflict("A folder with this name already exists here");
  }
}

export async function createFolder(db: PrismaClient, input: FolderCreateInput) {
  return db.$transaction(async (tx) => {
    const depth = (await ancestry(tx, input.parentId)).length;
    if (depth >= FOLDER_MAX_DEPTH) throw conflict("Folders are nested too deeply");
    await assertNameFree(tx, input.name, input.parentId);
    const folder = await tx.projectFolder.create({
      data: { name: input.name, parentId: input.parentId },
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

    if (parentId !== existing.parentId) {
      const above = await ancestry(tx, parentId);
      if (above.includes(id)) throw conflict("A folder cannot be moved into itself");
      if (above.length + (await height(tx, id)) > FOLDER_MAX_DEPTH) {
        throw conflict("Folders are nested too deeply");
      }
    }
    if (name !== existing.name || parentId !== existing.parentId) {
      await assertNameFree(tx, name, parentId, id);
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
          await assertNameFree(tx, name, folder.parentId, child.id);
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
    await tx.projectFolder.delete({ where: { id } });
    await notifyBoardChanged(tx, "folder", id);
  });
}

/** Checks that a project can be put in this folder (null = uncategorized). */
export async function assertFolderExists(db: Db, folderId: string | null) {
  if (folderId === null) return;
  if (!(await db.projectFolder.findUnique({ where: { id: folderId }, select: { id: true } }))) {
    throw notFound("Folder");
  }
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
export async function ensureFolderPath(db: Db, path: string[]): Promise<string | null> {
  let parentId: string | null = null;
  for (const name of path) {
    const siblings: { id: string; name: string }[] = await db.projectFolder.findMany({
      where: { parentId },
      select: { id: true, name: true },
    });
    const found = siblings.find((s) => s.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    parentId = found
      ? found.id
      : (await db.projectFolder.create({ data: { name, parentId }, select: { id: true } })).id;
  }
  return parentId;
}

/** Folder id → names from the top of the tree down to it, for every folder. */
export async function folderPathMap(db: Db): Promise<Map<string, string[]>> {
  const folders = await db.projectFolder.findMany({
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
