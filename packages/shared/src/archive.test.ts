import { describe, expect, it } from "vitest";
import { archiveBoardSchema, archiveCardSchema } from "./archive";

describe("archiveCardSchema", () => {
  const base = {
    title: null,
    start: "2026-05-04T09:00:00.000Z",
    end: "2026-05-04T10:00:00.000Z",
    allDay: false,
    statusOverride: null,
    progressOverride: null,
    shortNotes: null,
    members: [],
    labels: [],
  };

  it("reads cards from older archives, whose empty lists meant 'the project's'", () => {
    expect(archiveCardSchema.parse(base).perCard).toBe(false);
  });

  it("keeps the flag that marks a card's own lists", () => {
    expect(archiveCardSchema.parse({ ...base, perCard: true }).perCard).toBe(true);
  });
});

describe("calendars in archives", () => {
  const card = {
    title: null,
    start: "2026-05-04T09:00:00.000Z",
    end: "2026-05-04T10:00:00.000Z",
    allDay: false,
    statusOverride: null,
    progressOverride: null,
    shortNotes: null,
    members: [],
    labels: [],
  };
  const board = {
    workspace: {
      name: "W",
      timeZone: "Europe/Rome",
      workDayStart: "08:00",
      workDayEnd: "19:00",
      firstDayOfWeek: 1,
    },
    statuses: [],
    labels: [],
    users: [],
  };

  it("reads a card of an older archive as one with no calendar (the default applies)", () => {
    expect(archiveCardSchema.parse(card).calendar).toBeNull();
    expect(archiveCardSchema.parse({ ...card, calendar: "Work" }).calendar).toBe("Work");
  });

  it("reads a board of an older archive as one with no calendars", () => {
    expect(archiveBoardSchema.parse(board).calendars).toEqual([]);
    const parsed = archiveBoardSchema.parse({
      ...board,
      calendars: [{ name: "Work", color: "#112233" }],
    });
    expect(parsed.calendars).toEqual([
      { name: "Work", color: "#112233", kind: "local", isDefault: false },
    ]);
  });
});
