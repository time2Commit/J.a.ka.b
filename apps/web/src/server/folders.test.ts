import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@jakab/db";
import { FOLDER_MAX_DEPTH } from "@jakab/shared";
import {
  createFolder,
  deleteFolder,
  ensureFolderPath,
  folderPath,
  folderPathMap,
  listFolders,
  updateFolder,
} from "./folders";
import { listProjects } from "./projects-list";
import { updateProject } from "./projects";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const name = (n: string) => `${n} ${run}`;
let statusId: string;
const projectIds: string[] = [];

beforeAll(async () => {
  const status = await prisma.status.create({
    data: { name: name("Folders"), color: "#123456", order: 93 },
  });
  statusId = status.id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.projectFolder.deleteMany({ where: { name: { contains: run } } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.$disconnect();
});

async function project(label: string, folderId: string | null = null) {
  const p = await prisma.project.create({
    data: {
      name: name(label),
      nameNormalized: name(label).toLowerCase(),
      statusId,
      folderId,
      createdById: "u",
    },
  });
  projectIds.push(p.id);
  return p;
}

describe("folders of the template tree", () => {
  it("are a separate tree: own list, no mixing with projects, templates move up on delete", async () => {
    const tplFolder = await createFolder(prisma, {
      kind: "template",
      name: name("Tpl"),
      parentId: null,
    });
    const projectFolder = await createFolder(prisma, { name: name("Proj"), parentId: null });
    // The same name may exist in both trees.
    await createFolder(prisma, { kind: "template", name: name("Proj"), parentId: null });

    expect((await listFolders(prisma, "template")).map((f) => f.id)).toContain(tplFolder.id);
    expect((await listFolders(prisma, "template")).map((f) => f.id)).not.toContain(
      projectFolder.id,
    );
    expect((await listFolders(prisma)).map((f) => f.id)).not.toContain(tplFolder.id);

    // A folder cannot be put inside a folder of the other tree, in either direction.
    await expect(
      createFolder(prisma, { kind: "template", name: name("Bad"), parentId: projectFolder.id }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      updateFolder(prisma, projectFolder.id, { parentId: tplFolder.id }),
    ).rejects.toMatchObject({
      status: 409,
    });

    const outer = await createFolder(prisma, {
      kind: "template",
      name: name("Outer"),
      parentId: null,
    });
    const inner = await createFolder(prisma, {
      kind: "template",
      name: name("Inner"),
      parentId: outer.id,
    });
    const template = await prisma.template.create({
      data: { name: name("Tpl item"), defaults: {}, createdBy: "u", folderId: inner.id },
    });
    await deleteFolder(prisma, inner.id);
    expect((await prisma.template.findUniqueOrThrow({ where: { id: template.id } })).folderId).toBe(
      outer.id,
    );
    expect(await ensureFolderPath(prisma, [name("Path")], "template")).toBe(
      await ensureFolderPath(prisma, [name("path")], "template"),
    );
    expect((await folderPathMap(prisma, "template")).size).toBeGreaterThan(0);
  });
});

describe("folders", () => {
  it("creates nested folders and refuses a duplicate name next to it", async () => {
    const top = await createFolder(prisma, { name: name("Clients"), parentId: null });
    const sub = await createFolder(prisma, { name: name("2026"), parentId: top.id });
    expect(sub.parentId).toBe(top.id);
    await expect(
      createFolder(prisma, { name: name("clients").toUpperCase(), parentId: null }),
    ).rejects.toMatchObject({ status: 409 });
    // The same name is fine under another parent.
    await createFolder(prisma, { name: name("2026"), parentId: null });
    expect((await listFolders(prisma)).some((f) => f.id === sub.id)).toBe(true);
    expect(await folderPath(prisma, sub.id)).toEqual([name("Clients"), name("2026")]);
  });

  it("renames, moves, and refuses to move a folder into itself or its own subfolder", async () => {
    const a = await createFolder(prisma, { name: name("A"), parentId: null });
    const b = await createFolder(prisma, { name: name("B"), parentId: a.id });
    const c = await createFolder(prisma, { name: name("C"), parentId: b.id });

    expect(await updateFolder(prisma, c.id, { name: name("C2") })).toMatchObject({
      name: name("C2"),
    });
    await expect(updateFolder(prisma, a.id, { parentId: a.id })).rejects.toMatchObject({
      status: 409,
    });
    await expect(updateFolder(prisma, a.id, { parentId: c.id })).rejects.toMatchObject({
      status: 409,
    });
    const moved = await updateFolder(prisma, c.id, { parentId: null });
    expect(moved.parentId).toBeNull();
    await expect(updateFolder(prisma, "missing", { name: "x" })).rejects.toMatchObject({
      status: 404,
    });
  });

  it("limits how deep folders can be nested, also when moving a whole branch", async () => {
    let parentId: string | null = null;
    const ids: string[] = [];
    for (let level = 1; level <= FOLDER_MAX_DEPTH; level++) {
      const f: { id: string } = await createFolder(prisma, { name: name(`L${level}`), parentId });
      ids.push(f.id);
      parentId = f.id;
    }
    await expect(createFolder(prisma, { name: name("too deep"), parentId })).rejects.toMatchObject({
      status: 409,
    });
    const loose = await createFolder(prisma, { name: name("Loose branch"), parentId: null });
    await createFolder(prisma, { name: name("Loose child"), parentId: loose.id });
    await expect(updateFolder(prisma, loose.id, { parentId })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("moves projects between folders without counting it as a modification", async () => {
    const folder = await createFolder(prisma, { name: name("Moves"), parentId: null });
    const p = await project("Movable");
    const before = (await listProjects(prisma)).find((x) => x.id === p.id)!;
    expect(before.folderId).toBeNull();

    await updateProject(prisma, p.id, { folderId: folder.id }, "u");
    const after = (await listProjects(prisma)).find((x) => x.id === p.id)!;
    expect(after.folderId).toBe(folder.id);
    expect(after.lastModified).toBe(before.lastModified);

    await expect(updateProject(prisma, p.id, { folderId: "missing" }, "u")).rejects.toMatchObject({
      status: 404,
    });
    await updateProject(prisma, p.id, { folderId: null }, "u");
    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).folderId).toBeNull();
  });

  it("deletes a folder without losing what is inside: it moves up one level", async () => {
    const outer = await createFolder(prisma, { name: name("Outer"), parentId: null });
    const middle = await createFolder(prisma, { name: name("Middle"), parentId: outer.id });
    const inner = await createFolder(prisma, { name: name("Inner"), parentId: middle.id });
    // A sibling of the deleted folder already uses the child's name.
    await createFolder(prisma, { name: name("Inner"), parentId: outer.id });
    const p = await project("Inside", middle.id);

    await deleteFolder(prisma, middle.id);

    expect((await prisma.project.findUniqueOrThrow({ where: { id: p.id } })).folderId).toBe(
      outer.id,
    );
    const innerNow = await prisma.projectFolder.findUniqueOrThrow({ where: { id: inner.id } });
    expect(innerNow.parentId).toBe(outer.id);
    expect(innerNow.name).toBe(`${name("Inner")} (2)`);
    expect(await prisma.projectFolder.count({ where: { id: middle.id } })).toBe(0);
    await expect(deleteFolder(prisma, middle.id)).rejects.toMatchObject({ status: 404 });
  });

  it("finds or creates the folders of a path (used by import)", async () => {
    const id = await ensureFolderPath(prisma, [name("Imported"), name("Deep")]);
    expect(id).not.toBeNull();
    // Again, with different capitals: the same folders are reused.
    expect(await ensureFolderPath(prisma, [name("imported"), name("deep")])).toBe(id);
    expect(await ensureFolderPath(prisma, [])).toBeNull();
    expect((await folderPathMap(prisma)).get(id!)).toEqual([name("Imported"), name("Deep")]);
  });
});
