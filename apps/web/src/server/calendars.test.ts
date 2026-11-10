import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@jakab/db";
import { DEFAULT_CALENDAR_ID } from "@jakab/db/defaults";
import {
  createCalendar,
  deleteCalendar,
  getDefaultCalendar,
  listCalendars,
  reorderCalendars,
  updateCalendar,
} from "./calendars";
import { createCard, getCard, updateCard } from "./cards";
import { createStatus } from "./catalog";
import { HttpError } from "./errors";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const userId = `user-${run}`;
const start = new Date("2026-10-05T09:00:00Z");
const end = new Date("2026-10-05T10:00:00Z");
const cardInput = { start, end, allDay: false, labelIds: [], memberIds: [] };

let statusId: string;
const projectIds: string[] = [];
const calendarIds: string[] = [];
const newCalendar = async (suffix: string) => {
  const calendar = await createCalendar(prisma, { name: `${suffix} ${run}`, color: "#123456" });
  calendarIds.push(calendar.id);
  return calendar;
};
const newCard = async (name: string, calendarId?: string) => {
  const { card } = await createCard(
    prisma,
    { ...cardInput, projectName: `${name} ${run}`, statusId, calendarId },
    userId,
  );
  projectIds.push(card.projectId);
  return card;
};

beforeAll(async () => {
  statusId = (
    await createStatus(prisma, { name: `Cal status ${run}`, color: "#111111", isDone: false })
  ).id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.calendar.deleteMany({ where: { id: { in: calendarIds } } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await prisma.$disconnect();
});

describe("calendars", () => {
  it("has a default calendar that existing and new cards fall back to", async () => {
    const fallback = await getDefaultCalendar(prisma);
    expect(fallback.id).toBe(DEFAULT_CALENDAR_ID);
    const card = await newCard("Fallback");
    expect(card.calendar.id).toBe(DEFAULT_CALENDAR_ID);
  });

  it("creates calendars at the end of the list and rejects a repeated name", async () => {
    const calendar = await newCalendar("Work");
    expect(calendar).toMatchObject({ kind: "local", isDefault: false });
    const all = await listCalendars(prisma);
    expect(all.at(-1)!.order).toBeGreaterThanOrEqual(all[0]!.order);
    await expect(createCalendar(prisma, { name: calendar.name, color: "#000000" })).rejects.toThrow(
      HttpError,
    );
  });

  it("puts a card in the chosen calendar, moves it, and rejects an unknown calendar", async () => {
    const work = await newCalendar("Home");
    const card = await newCard("Chosen", work.id);
    expect(card.calendar).toEqual({ id: work.id, name: work.name, color: work.color });

    const moved = await updateCard(prisma, card.id, { calendarId: DEFAULT_CALENDAR_ID }, userId);
    expect(moved.calendar.id).toBe(DEFAULT_CALENDAR_ID);
    await expect(updateCard(prisma, card.id, { calendarId: "nope" }, userId)).rejects.toMatchObject(
      { status: 404 },
    );
    await expect(
      createCard(prisma, { ...cardInput, projectName: `Bad ${run}`, calendarId: "nope" }, userId),
    ).rejects.toMatchObject({ status: 404 });
    // The failed creation did not leave a project behind.
    expect(await prisma.project.count({ where: { name: `Bad ${run}` } })).toBe(0);
  });

  it("renames and recolors, but not onto a name that is taken", async () => {
    const a = await newCalendar("A");
    const b = await newCalendar("B");
    expect(await updateCalendar(prisma, a.id, { color: "#abcdef" })).toMatchObject({
      color: "#abcdef",
    });
    await expect(updateCalendar(prisma, a.id, { name: b.name })).rejects.toMatchObject({
      status: 409,
    });
    // Keeping its own name is fine.
    await updateCalendar(prisma, a.id, { name: a.name });
  });

  it("reorders", async () => {
    const a = await newCalendar("First");
    const b = await newCalendar("Second");
    await reorderCalendars(prisma, [b.id, a.id]);
    const ids = (await listCalendars(prisma)).map((c) => c.id);
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
    await expect(reorderCalendars(prisma, [a.id, a.id])).rejects.toMatchObject({ status: 409 });
    await expect(reorderCalendars(prisma, [a.id, "nope"])).rejects.toMatchObject({ status: 404 });
  });

  it("moves the cards of a deleted calendar to the one asked for, or the default", async () => {
    const doomed = await newCalendar("Doomed");
    const heir = await newCalendar("Heir");
    const first = await newCard("Doomed one", doomed.id);
    const second = await newCard("Doomed two", doomed.id);

    expect(await deleteCalendar(prisma, doomed.id, heir.id)).toEqual({
      cards: 2,
      calendarId: heir.id,
    });
    expect((await getCard(prisma, first.id)).calendar.id).toBe(heir.id);
    expect((await getCard(prisma, second.id)).calendar.id).toBe(heir.id);

    const other = await newCalendar("Other");
    const card = await newCard("Other one", other.id);
    expect((await deleteCalendar(prisma, other.id)).calendarId).toBe(DEFAULT_CALENDAR_ID);
    expect((await getCard(prisma, card.id)).calendar.id).toBe(DEFAULT_CALENDAR_ID);
  });

  it("never deletes the default calendar, nor moves cards onto the deleted one", async () => {
    await expect(deleteCalendar(prisma, DEFAULT_CALENDAR_ID)).rejects.toMatchObject({
      status: 409,
    });
    const calendar = await newCalendar("Self");
    await expect(deleteCalendar(prisma, calendar.id, calendar.id)).rejects.toMatchObject({
      status: 409,
    });
    await expect(deleteCalendar(prisma, "nope")).rejects.toMatchObject({ status: 404 });
  });

  it("forgets a deleted calendar in people's hidden lists", async () => {
    const calendar = await newCalendar("Hidden");
    const user = await prisma.user.create({
      data: {
        id: userId,
        name: "Test Person",
        email: `cal.${run}@example.com`,
        hiddenCalendarIds: [calendar.id, "other"],
      },
    });
    try {
      await deleteCalendar(prisma, calendar.id);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(after.hiddenCalendarIds).toEqual(["other"]);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
