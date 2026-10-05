import type { Prisma, PrismaClient } from "@jakab/db";
import {
  templateDefaultsSchema,
  type TemplateDefaults,
  type TemplateInput,
  type TemplateUpdateInput,
} from "@jakab/shared";
import { conflict, notFound } from "./errors";
import { filterFileEmbeds } from "./note-json";

export interface TemplateDto {
  id: string;
  name: string;
  defaults: TemplateDefaults;
  hasNote: boolean;
  updatedAt: string;
}

/** Stored defaults may predate a field or point at deleted catalog entries: normalize on read. */
export const parseDefaults = (raw: unknown): TemplateDefaults =>
  templateDefaultsSchema.parse(raw ?? {});

function toDto(t: {
  id: string;
  name: string;
  defaults: Prisma.JsonValue;
  noteJson: Prisma.JsonValue | null;
  updatedAt: Date;
}): TemplateDto {
  return {
    id: t.id,
    name: t.name,
    defaults: parseDefaults(t.defaults),
    hasNote: t.noteJson !== null,
    updatedAt: t.updatedAt.toISOString(),
  };
}

export async function listTemplates(db: PrismaClient) {
  return (await db.template.findMany({ orderBy: { name: "asc" } })).map(toDto);
}

export async function getTemplate(db: PrismaClient, id: string) {
  const template = await db.template.findUnique({ where: { id } });
  if (!template) throw notFound("Template");
  return { ...toDto(template), note: template.noteJson };
}

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

export async function createTemplate(db: PrismaClient, input: TemplateInput, userId: string) {
  try {
    const template = await db.template.create({
      data: {
        name: input.name,
        defaults: input.defaults,
        noteJson: input.note ? (filterFileEmbeds(input.note) as Prisma.InputJsonValue) : undefined,
        createdBy: userId,
      },
    });
    return { ...toDto(template), note: template.noteJson };
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("A template with this name already exists");
    throw error;
  }
}

export async function updateTemplate(db: PrismaClient, id: string, input: TemplateUpdateInput) {
  try {
    const template = await db.template.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.defaults !== undefined && { defaults: input.defaults }),
        ...(input.note !== undefined && {
          noteJson: input.note
            ? (filterFileEmbeds(input.note) as Prisma.InputJsonValue)
            : { type: "doc", content: [] },
        }),
      },
    });
    return { ...toDto(template), note: template.noteJson };
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict("A template with this name already exists");
    if ((error as { code?: string }).code === "P2025") throw notFound("Template");
    throw error;
  }
}

/** Projects made from the template keep existing: the link is cleared by the database. */
export async function deleteTemplate(db: PrismaClient, id: string) {
  const { count } = await db.template.deleteMany({ where: { id } });
  if (count === 0) throw notFound("Template");
}

/**
 * "Save project as template": settings and note content of the project. Files are left out,
 * since a template does not own attachments; the first card's length becomes the default duration.
 */
export async function saveProjectAsTemplate(
  db: PrismaClient,
  projectId: string,
  name: string,
  userId: string,
) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: {
      labels: true,
      members: true,
      note: { select: { json: true } },
      cards: {
        orderBy: { start: "asc" },
        take: 1,
        select: { start: true, end: true, allDay: true },
      },
    },
  });
  if (!project) throw notFound("Project");
  const card = project.cards[0];
  const minutes = card && !card.allDay ? Math.round((+card.end - +card.start) / 60_000) : 60;
  const defaults: TemplateDefaults = {
    statusId: project.statusId,
    labelIds: project.labels.map((l) => l.labelId),
    memberIds: project.members.map((m) => m.userId),
    durationMin: Math.min(7 * 24 * 60, Math.max(5, minutes)),
    checklist: [],
  };
  const note = project.note?.json as { type: "doc" } | null | undefined;
  return createTemplate(db, { name, defaults, note: note ?? null }, userId);
}
