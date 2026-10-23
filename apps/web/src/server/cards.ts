import type { Prisma, PrismaClient } from "@jakab/db";
import type { CardCreateInput, CardUpdateInput } from "@jakab/shared";
import { randomUUID } from "node:crypto";
import { prepareClone, type PreparedClone } from "./clone";
import { conflict, notFound } from "./errors";
import { existingIds } from "./ids";
import { insertProject } from "./projects";
import type { StorageDriver } from "./storage";
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
function toCardDto(card: CardRecord) {
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
        const made = await insertProject(
          tx,
          {
            id: newProjectId,
            name: input.projectName!,
            statusId: input.statusId,
            labelIds: input.labelIds,
            memberIds: input.memberIds,
            templateId: input.templateId,
            cloneFromProjectId: input.cloneFromProjectId,
            folderId: null,
          },
          userId,
          clone,
        );
        projectId = made.projectId;
        createdProject = true;
        start = {
          statusId: made.statusId,
          progress: 0,
          labelIds: made.labelIds,
          memberIds: made.memberIds,
        };
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
