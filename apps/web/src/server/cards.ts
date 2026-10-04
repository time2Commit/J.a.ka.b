import type { Prisma, PrismaClient } from "@jakab/db";
import { normalizeProjectName, type CardCreateInput, type CardUpdateInput } from "@jakab/shared";
import { conflict, notFound } from "./errors";
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

/** Creates the card and, when needed, its project and note, in a single transaction. */
export async function createCard(db: PrismaClient, input: CardCreateInput, userId: string) {
  return db.$transaction(async (tx) => {
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
      const status = input.statusId
        ? await tx.status.findUnique({ where: { id: input.statusId } })
        : await tx.status.findFirst({ orderBy: { order: "asc" } });
      if (!status) throw notFound("Status");
      const project = await tx.project.create({
        data: {
          name,
          nameNormalized,
          statusId: status.id,
          createdById: userId,
          labels: { create: input.labelIds.map((labelId) => ({ labelId })) },
          members: { create: input.memberIds.map((id) => ({ userId: id })) },
          note: { create: {} },
        },
      });
      projectId = project.id;
      createdProject = true;
      await tx.activity.create({
        data: { projectId, userId, type: "project.created", payload: { name } },
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
