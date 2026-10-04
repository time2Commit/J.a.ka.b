import type { PrismaClient } from "@jakab/db";
import type { LabelInput, StatusInput } from "@jakab/shared";
import { conflict, notFound } from "./errors";
import { notifyBoardChanged } from "./notify";

export const listStatuses = (db: PrismaClient) => db.status.findMany({ orderBy: { order: "asc" } });

export async function createStatus(db: PrismaClient, input: StatusInput) {
  const last = await db.status.findFirst({ orderBy: { order: "desc" } });
  const status = await db.status.create({ data: { ...input, order: (last?.order ?? -1) + 1 } });
  await notifyBoardChanged(db, "status", status.id);
  return status;
}

export async function updateStatus(db: PrismaClient, id: string, input: Partial<StatusInput>) {
  if (!(await db.status.findUnique({ where: { id }, select: { id: true } }))) {
    throw notFound("Status");
  }
  const status = await db.status.update({ where: { id }, data: input });
  await notifyBoardChanged(db, "status", id);
  return status;
}

export async function reorderStatuses(db: PrismaClient, ids: string[]) {
  await db.$transaction(
    ids.map((id, order) => db.status.update({ where: { id }, data: { order } })),
  );
  await notifyBoardChanged(db, "status");
}

/** A status in use cannot be deleted; at least one status must always exist. */
export async function deleteStatus(db: PrismaClient, id: string) {
  const [total, usedByProjects, usedByCards] = await Promise.all([
    db.status.count(),
    db.project.count({ where: { statusId: id } }),
    db.card.count({ where: { statusOverrideId: id } }),
  ]);
  if (total <= 1) throw conflict("At least one status is required");
  if (usedByProjects + usedByCards > 0) throw conflict("Status is in use");
  await db.status.delete({ where: { id } });
  await notifyBoardChanged(db, "status", id);
}

export const listLabels = (db: PrismaClient) => db.label.findMany({ orderBy: { name: "asc" } });

export async function createLabel(db: PrismaClient, input: LabelInput) {
  const label = await db.label.create({ data: input });
  await notifyBoardChanged(db, "label", label.id);
  return label;
}

export async function updateLabel(db: PrismaClient, id: string, input: Partial<LabelInput>) {
  if (!(await db.label.findUnique({ where: { id }, select: { id: true } }))) {
    throw notFound("Label");
  }
  const label = await db.label.update({ where: { id }, data: input });
  await notifyBoardChanged(db, "label", id);
  return label;
}

export async function deleteLabel(db: PrismaClient, id: string) {
  if (!(await db.label.findUnique({ where: { id }, select: { id: true } }))) {
    throw notFound("Label");
  }
  await db.label.delete({ where: { id } });
  await notifyBoardChanged(db, "label", id);
}
