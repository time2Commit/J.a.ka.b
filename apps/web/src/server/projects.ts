import type { Prisma, PrismaClient } from "@jakab/db";
import {
  normalizeProjectName,
  type ProjectCreateInput,
  type ProjectUpdateInput,
} from "@jakab/shared";
import { randomUUID } from "node:crypto";
import type { PreparedClone } from "./clone";
import { conflict, HttpError, notFound } from "./errors";
import { assertFolderExists } from "./folders";
import { existingIds } from "./ids";
import { noteFromTemplate } from "./note-json";
import { notifyBoardChanged } from "./notify";
import { replaceRelations } from "./relations";
import type { StorageDriver } from "./storage";
import { parseDefaults } from "./templates";

const projectInclude = { labels: true, members: true } as const;

export async function getProject(db: PrismaClient, id: string) {
  const project = await db.project.findUnique({ where: { id }, include: projectInclude });
  if (!project) throw notFound("Project");
  return toProjectDto(project);
}

function toProjectDto(p: Prisma.ProjectGetPayload<{ include: typeof projectInclude }>) {
  return {
    id: p.id,
    name: p.name,
    statusId: p.statusId,
    progress: p.progress,
    color: p.color,
    labelIds: p.labels.map((l) => l.labelId),
    memberIds: p.members.map((m) => m.userId),
  };
}
export async function updateProject(
  db: PrismaClient,
  id: string,
  input: ProjectUpdateInput,
  userId: string,
) {
  return db.$transaction(async (tx) => {
    if (!(await tx.project.findUnique({ where: { id }, select: { id: true } }))) {
      throw notFound("Project");
    }
    const { labelIds, memberIds, ...fields } = input;
    if (fields.folderId !== undefined) await assertFolderExists(tx, fields.folderId, "project");
    const project = await tx.project.update({
      where: { id },
      data: {
        ...fields,
        ...replaceRelations({ labelIds, memberIds }),
      },
      include: projectInclude,
    });
    await tx.activity.create({
      data: {
        projectId: id,
        userId,
        type: "project.updated",
        payload: { fields: Object.keys(input) },
      },
    });
    await notifyBoardChanged(tx, "project", id);
    return toProjectDto(project);
  });
}

type Tx = Prisma.TransactionClient;

/**
 * Creates a project with its (empty or templated) note and the "project.created" activity, inside
 * the caller's transaction. Explicit choices win; otherwise the template (or the copied project)
 * fills in, and the first status is the fallback. Used by "new card with a new project" and by
 * "new project".
 */
export async function insertProject(
  tx: Tx,
  input: {
    id: string;
    name: string;
    statusId?: string;
    labelIds?: string[];
    memberIds?: string[];
    templateId?: string | null;
    cloneFromProjectId?: string | null;
    folderId: string | null;
  },
  userId: string,
  clone: PreparedClone | null = null,
) {
  const name = input.name;
  const nameNormalized = normalizeProjectName(name);
  if (await tx.project.findUnique({ where: { nameNormalized }, select: { id: true } })) {
    throw conflict("A project with this name already exists: link it instead");
  }
  await assertFolderExists(tx, input.folderId, "project");

  const template = input.templateId
    ? await tx.template.findUnique({ where: { id: input.templateId } })
    : null;
  if (input.templateId && !template) throw notFound("Template");
  const defaults = template ? parseDefaults(template.defaults) : null;

  const wantedStatus = input.statusId ?? defaults?.statusId ?? null;
  const status =
    (wantedStatus ? await tx.status.findUnique({ where: { id: wantedStatus } }) : null) ??
    (input.statusId ? null : await tx.status.findFirst({ orderBy: { order: "asc" } }));
  if (!status) throw notFound("Status");

  const labelIds = await existingIds(
    (args) => tx.label.findMany(args),
    input.labelIds && input.labelIds.length > 0
      ? input.labelIds
      : (defaults?.labelIds ?? clone?.labelIds ?? []),
  );
  const memberIds = await existingIds(
    (args) => tx.user.findMany(args),
    input.memberIds && input.memberIds.length > 0
      ? input.memberIds
      : (defaults?.memberIds ?? clone?.memberIds ?? []),
  );
  const note = template
    ? noteFromTemplate(template.noteJson as object | null, defaults!.checklist)
    : (clone?.note ?? null);

  const project = await tx.project.create({
    data: {
      id: input.id,
      name,
      nameNormalized,
      statusId: status.id,
      color: clone?.color ?? null,
      folderId: input.folderId,
      createdById: userId,
      templateId: template?.id ?? null,
      clonedFromId: input.cloneFromProjectId ?? null,
      labels: { create: labelIds.map((labelId) => ({ labelId })) },
      members: { create: memberIds.map((id) => ({ userId: id })) },
      note: { create: note ? { json: note as Prisma.InputJsonValue } : {} },
      ...(clone && clone.attachments.length > 0 && { attachments: { create: clone.attachments } }),
    },
  });
  await tx.activity.create({
    data: {
      projectId: project.id,
      userId,
      type: "project.created",
      payload: {
        name,
        ...(template && { templateId: template.id }),
        ...(input.cloneFromProjectId && { clonedFrom: input.cloneFromProjectId }),
      },
    },
  });
  return { projectId: project.id, statusId: status.id, labelIds, memberIds };
}

/** "New project": a project and its note without any card; it shows under "To schedule". */
export async function createProject(db: PrismaClient, input: ProjectCreateInput, userId: string) {
  return db.$transaction(async (tx) => {
    const { projectId } = await insertProject(
      tx,
      {
        id: randomUUID(),
        name: input.name,
        templateId: input.templateId ?? null,
        folderId: input.folderId ?? null,
      },
      userId,
    );
    await notifyBoardChanged(tx, "project", projectId);
    return getProjectIn(tx, projectId);
  });
}

async function getProjectIn(tx: Tx, id: string) {
  const project = await tx.project.findUniqueOrThrow({ where: { id }, include: projectInclude });
  return toProjectDto(project);
}

/**
 * Deletes a project with its note, versions, cards and files. Only an administrator or the person
 * who created the project may do it: it cannot be undone.
 */
export async function deleteProject(
  db: PrismaClient,
  storage: StorageDriver,
  id: string,
  actor: { id: string; role: "admin" | "member" },
) {
  const project = await db.project.findUnique({
    where: { id },
    select: { createdById: true, attachments: { select: { storageKey: true } } },
  });
  if (!project) throw notFound("Project");
  if (actor.role !== "admin" && project.createdById !== actor.id) {
    throw new HttpError(403, "Only an administrator or the project's creator can delete it");
  }
  await db.$transaction(async (tx) => {
    await tx.project.delete({ where: { id } });
    await notifyBoardChanged(tx, "project", id);
  });
  // The rows are gone: the files are removed afterwards, and a failure only leaves orphans.
  await Promise.all(
    project.attachments.map((a) => storage.remove(a.storageKey).catch(() => undefined)),
  );
}
