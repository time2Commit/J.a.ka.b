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

/**
 * Deletes a status. Projects and cards that use it move to `replaceWith`, or to the nearest
 * remaining status (the previous one, else the next) when none is given. At least one status
 * must always exist.
 */
export async function deleteStatus(db: PrismaClient, id: string, replaceWith?: string) {
  const moved = await db.$transaction(async (tx) => {
    const all = await tx.status.findMany({ orderBy: { order: "asc" } });
    const index = all.findIndex((s) => s.id === id);
    if (index < 0) throw notFound("Status");
    if (all.length <= 1) throw conflict("At least one status is required");
    if (replaceWith === id) throw conflict("Pick a different status to move items to");
    const replacement = replaceWith
      ? all.find((s) => s.id === replaceWith)
      : (all[index - 1] ?? all[index + 1]);
    if (!replacement) throw notFound("Status");

    const [projects, cards] = await Promise.all([
      tx.project.updateMany({ where: { statusId: id }, data: { statusId: replacement.id } }),
      tx.card.updateMany({
        where: { statusOverrideId: id },
        data: { statusOverrideId: replacement.id },
      }),
    ]);
    await tx.status.delete({ where: { id } });
    await notifyBoardChanged(tx, "status", id);
    return { projects: projects.count, cards: cards.count, statusId: replacement.id };
  });
  return moved;
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
