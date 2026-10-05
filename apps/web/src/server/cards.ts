import type { Prisma, PrismaClient } from "@jakab/db";
import { normalizeProjectName, type CardCreateInput, type CardUpdateInput } from "@jakab/shared";
import { randomUUID } from "node:crypto";
import { prepareClone, type PreparedClone } from "./clone";
import { conflict, notFound } from "./errors";
import { noteFromTemplate } from "./note-json";
import type { StorageDriver } from "./storage";
import { parseDefaults } from "./templates";
import { notifyBoardChanged } from "./notify";

const cardInclude = {
  project: {
    include: { status: true, labels: { include: { label: true } }, members: true },
  },
  statusOverride: true,
  labels: { include: { label: true } },
  members: true,
} satisfies Prisma.CardInclude;

type CardRecord = Prisma.CardGetPayload<{ include: typeof cardInclude }>;

export type CardDto = ReturnType<typeof toCardDto>;

/** Card + inherited project data. Status, progress, labels and members fall back to the project. */
export function toCardDto(card: CardRecord) {
  const status = card.statusOverride ?? card.project.status;
  const labels = card.labels.length > 0 ? card.labels : card.project.labels;
  const members = card.members.length > 0 ? card.members : card.project.members;
  return {
    id: card.id,
    projectId: card.projectId,
    projectName: card.project.name,
    title: card.title,
    start: card.start.toISOString(),
    end: card.end.toISOString(),
    allDay: card.allDay,
    shortNotes: card.shortNotes,
    status: { id: status.id, name: status.name, color: status.color, isDone: status.isDone },
    statusOverridden: card.statusOverrideId !== null,
    progress: card.progressOverride ?? card.project.progress,
    progressOverridden: card.progressOverride !== null,
    labels: labels.map(({ label }) => ({ id: label.id, name: label.name, color: label.color })),
    memberIds: members.map((m) => m.userId),
  };
}

/** Cards overlapping [from, to). */
export async function listCards(db: PrismaClient, from: Date, to: Date) {
  const cards = await db.card.findMany({
    where: { start: { lt: to }, end: { gt: from } },
    include: cardInclude,
    orderBy: { start: "asc" },
  });
  return cards.map(toCardDto);
}

export async function getCard(db: PrismaClient, id: string) {
  const card = await db.card.findUnique({ where: { id }, include: cardInclude });
  if (!card) throw notFound("Card");
  return toCardDto(card);
}

/** Ids that still exist, in the given order (templates and clones may point at deleted entries). */
async function existingIds(
  list: (args: {
    where: { id: { in: string[] } };
    select: { id: true };
  }) => Promise<{ id: string }[]>,
  ids: string[],
) {
  if (ids.length === 0) return [];
  const found = new Set(
    (await list({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id),
  );
  return ids.filter((id) => found.has(id));
}

/**
 * Creates the card and, when needed, its project and note, in a single transaction. A new project
 * can start empty, from a template, or as a copy of another project (`storage` is needed to
 * duplicate the files of the copied note).
 */
export async function createCard(
  db: PrismaClient,
  input: CardCreateInput,
  userId: string,
  deps: { storage?: StorageDriver } = {},
) {
  const newProjectId = randomUUID();
  let clone: PreparedClone | null = null;
  if (!input.projectId && input.cloneFromProjectId) {
    if (!deps.storage) throw new Error("Cloning needs a storage driver");
    clone = await prepareClone(db, deps.storage, {
      sourceId: input.cloneFromProjectId,
      newProjectId,
      userId,
      includeNote: input.cloneNote ?? true,
    });
  }

  try {
    return await db.$transaction(async (tx) => {
      let projectId = input.projectId;
      let createdProject = false;

      if (projectId) {
        if (!(await tx.project.findUnique({ where: { id: projectId }, select: { id: true } }))) {
          throw notFound("Project");
        }
      } else {
        const name = input.projectName!;
        const nameNormalized = normalizeProjectName(name);
        if (await tx.project.findUnique({ where: { nameNormalized }, select: { id: true } })) {
          throw conflict("A project with this name already exists: link it instead");
        }

        const template = input.templateId
          ? await tx.template.findUnique({ where: { id: input.templateId } })
          : null;
        if (input.templateId && !template) throw notFound("Template");
        const defaults = template ? parseDefaults(template.defaults) : null;

        // Explicit choices win; otherwise the template (or the copied project) fills in.
        const wantedStatus = input.statusId ?? defaults?.statusId ?? null;
        const status =
          (wantedStatus ? await tx.status.findUnique({ where: { id: wantedStatus } }) : null) ??
          (input.statusId ? null : await tx.status.findFirst({ orderBy: { order: "asc" } }));
        if (!status) throw notFound("Status");

        const labelIds = await existingIds(
          (args) => tx.label.findMany(args),
          input.labelIds.length > 0
            ? input.labelIds
            : (defaults?.labelIds ?? clone?.labelIds ?? []),
        );
        const memberIds = await existingIds(
          (args) => tx.user.findMany(args),
          input.memberIds.length > 0
            ? input.memberIds
            : (defaults?.memberIds ?? clone?.memberIds ?? []),
        );
        const note = template
          ? noteFromTemplate(template.noteJson as object | null, defaults!.checklist)
          : (clone?.note ?? null);

        const project = await tx.project.create({
          data: {
            id: newProjectId,
            name,
            nameNormalized,
            statusId: status.id,
            color: clone?.color ?? null,
            createdById: userId,
            templateId: template?.id ?? null,
            clonedFromId: input.cloneFromProjectId ?? null,
            labels: { create: labelIds.map((labelId) => ({ labelId })) },
            members: { create: memberIds.map((id) => ({ userId: id })) },
            note: { create: note ? { json: note as Prisma.InputJsonValue } : {} },
            ...(clone &&
              clone.attachments.length > 0 && { attachments: { create: clone.attachments } }),
          },
        });
        projectId = project.id;
        createdProject = true;
        await tx.activity.create({
          data: {
            projectId,
            userId,
            type: "project.created",
            payload: {
              name,
              ...(template && { templateId: template.id }),
              ...(input.cloneFromProjectId && { clonedFrom: input.cloneFromProjectId }),
            },
          },
        });
      }

      const card = await tx.card.create({
        data: {
          projectId,
          title: input.title || null,
          start: input.start,
          end: input.end,
          allDay: input.allDay,
          shortNotes: input.shortNotes ?? null,
          createdById: userId,
        },
        include: cardInclude,
      });
      await tx.activity.create({
        data: { projectId, userId, type: "card.created", payload: { cardId: card.id } },
      });
      await notifyBoardChanged(tx, "card", card.id);
      return { card: toCardDto(card), createdProject };
    });
  } catch (error) {
    // The copied files belong to a project that was never created.
    if (clone && deps.storage) {
      await Promise.all(
        clone.storedKeys.map((key) => deps.storage!.remove(key).catch(() => undefined)),
      );
    }
    throw error;
  }
}

export async function updateCard(
  db: PrismaClient,
  id: string,
  input: CardUpdateInput,
  userId: string,
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.card.findUnique({ where: { id } });
    if (!existing) throw notFound("Card");

    const start = input.start ?? existing.start;
    const end = input.end ?? existing.end;
    if (end < start) throw conflict("end must not be before start");

    const { labelIds, memberIds, ...fields } = input;
    const card = await tx.card.update({
      where: { id },
      data: {
        ...fields,
        ...(labelIds && {
          labels: { deleteMany: {}, create: labelIds.map((labelId) => ({ labelId })) },
        }),
        ...(memberIds && {
          members: { deleteMany: {}, create: memberIds.map((uid) => ({ userId: uid })) },
        }),
      },
      include: cardInclude,
    });
    await tx.activity.create({
      data: {
        projectId: card.projectId,
        userId,
        type: "card.updated",
        payload: { cardId: id, fields: Object.keys(input) },
      },
    });
    await notifyBoardChanged(tx, "card", id);
    return toCardDto(card);
  });
}

export async function deleteCard(db: PrismaClient, id: string, userId: string) {
  await db.$transaction(async (tx) => {
    const card = await tx.card.findUnique({ where: { id } });
    if (!card) throw notFound("Card");
    await tx.card.delete({ where: { id } });
    await tx.activity.create({
      data: { projectId: card.projectId, userId, type: "card.deleted", payload: { cardId: id } },
    });
    await notifyBoardChanged(tx, "card", id);
  });
}
