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
  project: { select: { name: true } },
  status: true,
  labels: { include: { label: true } },
  members: true,
} satisfies Prisma.CardInclude;

type CardRecord = Prisma.CardGetPayload<{ include: typeof cardInclude }>;

export type CardDto = ReturnType<typeof toCardDto>;

/** What the calendar and the card panel show: everything here belongs to the card itself. */
export function toCardDto(card: CardRecord) {
  return {
    id: card.id,
    projectId: card.projectId,
    projectName: card.project.name,
    title: card.title,
    start: card.start.toISOString(),
    end: card.end.toISOString(),
    allDay: card.allDay,
    shortNotes: card.shortNotes,
    status: {
      id: card.status.id,
      name: card.status.name,
      color: card.status.color,
      isDone: card.status.isDone,
    },
    progress: card.progress,
    labels: card.labels.map(({ label }) => ({
      id: label.id,
      name: label.name,
      color: label.color,
    })),
    memberIds: card.members.map((m) => m.userId),
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
      // What the new card starts with: the project's latest values, or what was chosen.
      let start: { statusId: string; progress: number; labelIds: string[]; memberIds: string[] };

      if (projectId) {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          include: { labels: true, members: true },
        });
        if (!project) throw notFound("Project");
        const chosenStatus = input.statusId
          ? await tx.status.findUnique({ where: { id: input.statusId }, select: { id: true } })
          : null;
        if (input.statusId && !chosenStatus) throw notFound("Status");
        start = {
          statusId: chosenStatus?.id ?? project.statusId,
          progress: project.progress,
          labelIds: await existingIds(
            (args) => tx.label.findMany(args),
            input.labelIds.length > 0 ? input.labelIds : project.labels.map((l) => l.labelId),
          ),
          memberIds: await existingIds(
            (args) => tx.user.findMany(args),
            input.memberIds.length > 0 ? input.memberIds : project.members.map((m) => m.userId),
          ),
        };
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
        start = { statusId: status.id, progress: 0, labelIds, memberIds };
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
          statusId: start.statusId,
          progress: start.progress,
          labels: { create: start.labelIds.map((labelId) => ({ labelId })) },
          members: { create: start.memberIds.map((uid) => ({ userId: uid })) },
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

/**
 * The project remembers the status, progress, labels and people of the card edited last: lists
 * of projects show them, and the project's next card starts from them.
 */
async function rememberOnProject(tx: Prisma.TransactionClient, card: CardRecord) {
  await tx.project.update({
    where: { id: card.projectId },
    data: {
      statusId: card.statusId,
      progress: card.progress,
      labels: { deleteMany: {}, create: card.labels.map((l) => ({ labelId: l.labelId })) },
      members: { deleteMany: {}, create: card.members.map((m) => ({ userId: m.userId })) },
    },
  });
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
    if (input.statusId || input.progress !== undefined || labelIds || memberIds) {
      await rememberOnProject(tx, card);
    }
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
