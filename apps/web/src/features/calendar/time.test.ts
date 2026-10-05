import { describe, expect, it } from "vitest";
import {
  autoEndDate,
  defaultDraft,
  draftToRange,
  dropToRange,
  eventToRange,
  selectionToDraft,
  withDuration,
} from "./time";

describe("draftToRange", () => {
  it("converts workspace-local times to UTC instants (CEST, UTC+2)", () => {
    const range = draftToRange(
      {
        allDay: false,
        date: "2026-10-05",
        startTime: "09:00",
        endDate: "2026-10-05",
        endTime: "12:30",
      },
      "Europe/Rome",
    );
    expect(range).toEqual({ start: "2026-10-05T07:00:00.000Z", end: "2026-10-05T10:30:00.000Z" });
  });
  it("handles the winter offset (CET, UTC+1)", () => {
    const range = draftToRange(
      {
        allDay: false,
        date: "2026-12-01",
        startTime: "09:00",
        endDate: "2026-12-01",
        endTime: "10:00",
      },
      "Europe/Rome",
    );
    expect(range.start).toBe("2026-12-01T08:00:00.000Z");
  });
  it("stores all-day cards as UTC midnights with an exclusive end", () => {
    const range = draftToRange(
      { allDay: true, date: "2026-10-05", startTime: "", endDate: "2026-10-06", endTime: "" },
      "Europe/Rome",
    );
    expect(range).toEqual({ start: "2026-10-05T00:00:00.000Z", end: "2026-10-07T00:00:00.000Z" });
  });
});

describe("selectionToDraft", () => {
  it("reads a timed selection in the workspace time zone", () => {
    const draft = selectionToDraft(
      "2026-10-05T09:00:00+02:00",
      "2026-10-05T10:00:00+02:00",
      false,
      "Europe/Rome",
    );
    expect(draft).toMatchObject({
      date: "2026-10-05",
      startTime: "09:00",
      endDate: "2026-10-05",
      endTime: "10:00",
    });
  });
  it("turns the exclusive all-day end into an inclusive last day", () => {
    const draft = selectionToDraft("2026-10-05", "2026-10-07", true, "Europe/Rome");
    expect(draft).toMatchObject({ allDay: true, date: "2026-10-05", endDate: "2026-10-06" });
    expect(selectionToDraft("2026-10-05", "2026-10-06", true, "Europe/Rome").endDate).toBe(
      "2026-10-05",
    );
  });
});

describe("eventToRange / defaultDraft", () => {
  it("normalizes timed and all-day events", () => {
    expect(
      eventToRange({
        startStr: "2026-10-05T09:00:00+02:00",
        endStr: "2026-10-05T10:00:00+02:00",
        allDay: false,
      }),
    ).toEqual({
      start: "2026-10-05T07:00:00.000Z",
      end: "2026-10-05T08:00:00.000Z",
      allDay: false,
    });
    expect(eventToRange({ startStr: "2026-10-05", endStr: "2026-10-06", allDay: true })).toEqual({
      start: "2026-10-05T00:00:00.000Z",
      end: "2026-10-06T00:00:00.000Z",
      allDay: true,
    });
  });
  it("proposes the next full hour, one hour long", () => {
    const draft = defaultDraft(new Date("2026-10-05T07:20:00Z"), "Europe/Rome");
    expect(draft).toMatchObject({ date: "2026-10-05", startTime: "10:00", endTime: "11:00" });
  });
});

describe("dropToRange", () => {
  it("gives a timed drop a one-hour card", () => {
    expect(dropToRange("2026-10-05T09:30:00+02:00", false)).toEqual({
      start: "2026-10-05T07:30:00.000Z",
      end: "2026-10-05T08:30:00.000Z",
      allDay: false,
    });
  });
  it("gives an all-day drop a single UTC day", () => {
    expect(dropToRange("2026-10-05", true)).toEqual({
      start: "2026-10-05T00:00:00.000Z",
      end: "2026-10-06T00:00:00.000Z",
      allDay: true,
    });
  });
});

describe("autoEndDate", () => {
  const base = { allDay: false, date: "2026-10-04", startTime: "09:00", endTime: "10:00" };
  it("stays on the same day unless the end time is earlier than the start", () => {
    expect(autoEndDate(base)).toBe("2026-10-04");
    expect(autoEndDate({ ...base, endTime: "09:00" })).toBe("2026-10-04");
    expect(autoEndDate({ ...base, startTime: "23:00", endTime: "00:30" })).toBe("2026-10-05");
  });
  it("rolls over month and year ends", () => {
    expect(autoEndDate({ ...base, date: "2026-12-31", startTime: "23:00", endTime: "01:00" })).toBe(
      "2027-01-01",
    );
  });
  it("ignores times for all-day cards and tolerates an empty date", () => {
    expect(autoEndDate({ ...base, allDay: true, startTime: "23:00", endTime: "00:00" })).toBe(
      "2026-10-04",
    );
    expect(autoEndDate({ ...base, date: "" })).toBe("");
  });
  it("matches the default draft, which may end after midnight", () => {
    const draft = defaultDraft(new Date("2026-10-04T20:30:00Z"), "Europe/Rome"); // 22:30 in Rome
    expect(draft).toMatchObject({
      date: "2026-10-04",
      startTime: "23:00",
      endTime: "00:00",
      endDate: "2026-10-05",
    });
    expect(autoEndDate(draft)).toBe(draft.endDate);
  });
});

describe("withDuration", () => {
  const draft = {
    allDay: false,
    date: "2026-10-04",
    startTime: "09:30",
    endDate: "2026-10-04",
    endTime: "10:30",
  };
  it("moves the end to start + duration, across midnight too", () => {
    expect(withDuration(draft, 90)).toMatchObject({ endDate: "2026-10-04", endTime: "11:00" });
    expect(withDuration({ ...draft, startTime: "23:00" }, 150)).toMatchObject({
      endDate: "2026-10-05",
      endTime: "01:30",
    });
  });
  it("leaves all-day drafts alone", () => {
    const allDay = { ...draft, allDay: true };
    expect(withDuration(allDay, 90)).toBe(allDay);
  });
});
