import type { PrismaClient } from "@jakab/db";
import type { CalendarInput } from "@jakab/shared";
import { conflict, notFound } from "./errors";
import { notifyBoardChanged } from "./notify";

export const listCalendars = (db: PrismaClient) =>
  db.calendar.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] });

/** The calendar that receives cards naming none, and that cannot be deleted. */
export async function getDefaultCalendar(db: Pick<PrismaClient, "calendar">) {
  const calendar = await db.calendar.findFirst({ where: { isDefault: true } });
  if (!calendar) throw notFound("Calendar");
  return calendar;
}

async function assertNameFree(db: PrismaClient, name: string, exceptId?: string) {
  const taken = await db.calendar.findUnique({ where: { name }, select: { id: true } });
  if (taken && taken.id !== exceptId) throw conflict("A calendar with this name already exists");
}

export async function createCalendar(db: PrismaClient, input: CalendarInput) {
  await assertNameFree(db, input.name);
  const last = await db.calendar.findFirst({ orderBy: { order: "desc" } });
  const calendar = await db.calendar.create({
    data: { ...input, kind: "local", order: (last?.order ?? -1) + 1 },
  });
  await notifyBoardChanged(db, "calendar", calendar.id);
  return calendar;
}

export async function updateCalendar(db: PrismaClient, id: string, input: Partial<CalendarInput>) {
  if (!(await db.calendar.findUnique({ where: { id }, select: { id: true } }))) {
    throw notFound("Calendar");
  }
  if (input.name !== undefined) await assertNameFree(db, input.name, id);
  const calendar = await db.calendar.update({ where: { id }, data: input });
  await notifyBoardChanged(db, "calendar", id);
  return calendar;
}

/** Sets the order of the calendars named, each at most once; an unknown id is refused. */
export async function reorderCalendars(db: PrismaClient, ids: string[]) {
  if (new Set(ids).size !== ids.length) throw conflict("A calendar can appear only once");
  await db.$transaction(async (tx) => {
    const known = new Set((await tx.calendar.findMany({ select: { id: true } })).map((c) => c.id));
    if (!ids.every((id) => known.has(id))) throw notFound("Calendar");
    for (const [order, id] of ids.entries()) {
      await tx.calendar.update({ where: { id }, data: { order } });
    }
    await notifyBoardChanged(tx, "calendar");
  });
}

/**
 * Deletes a calendar. Its cards move to `replaceWith`, or to the default calendar when none is
 * given. The default calendar cannot be deleted, so at least one always exists.
 */
export async function deleteCalendar(db: PrismaClient, id: string, replaceWith?: string) {
  return db.$transaction(async (tx) => {
    const calendar = await tx.calendar.findUnique({ where: { id } });
    if (!calendar) throw notFound("Calendar");
    if (calendar.isDefault) throw conflict("The default calendar cannot be deleted");
    if (replaceWith === id) throw conflict("Pick a different calendar to move cards to");
    const replacement = replaceWith
      ? await tx.calendar.findUnique({ where: { id: replaceWith } })
      : await getDefaultCalendar(tx);
    if (!replacement) throw notFound("Calendar");

    const cards = await tx.card.updateMany({
      where: { calendarId: id },
      data: { calendarId: replacement.id },
    });
    // Nobody keeps a hidden-calendar entry for a calendar that no longer exists.
    await tx.$executeRaw`UPDATE "user" SET "hiddenCalendarIds" = array_remove("hiddenCalendarIds", ${id})`;
    await tx.calendar.delete({ where: { id } });
    await notifyBoardChanged(tx, "calendar", id);
    return { cards: cards.count, calendarId: replacement.id };
  });
}
