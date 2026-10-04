import { DateTime } from "luxon";

/**
 * Timed cards are stored as real instants (UTC) and shown in the workspace time zone.
 * All-day cards are stored as UTC midnight markers with an exclusive end (next day),
 * the same convention the calendar uses.
 */

export interface Draft {
  allDay: boolean;
  /** yyyy-MM-dd */
  date: string;
  /** HH:mm (timed cards) */
  startTime: string;
  /** yyyy-MM-dd, inclusive last day */
  endDate: string;
  /** HH:mm */
  endTime: string;
}

export function draftToRange(draft: Draft, timeZone: string): { start: string; end: string } {
  if (draft.allDay) {
    const start = DateTime.fromISO(draft.date, { zone: "utc" });
    const end = DateTime.fromISO(draft.endDate, { zone: "utc" }).plus({ days: 1 });
    return { start: start.toISO()!, end: end.toISO()! };
  }
  const start = DateTime.fromISO(`${draft.date}T${draft.startTime}`, { zone: timeZone });
  const end = DateTime.fromISO(`${draft.endDate}T${draft.endTime}`, { zone: timeZone });
  return { start: start.toUTC().toISO()!, end: end.toUTC().toISO()! };
}

/** Builds a form draft from the calendar selection (`startStr`/`endStr` as given by the calendar). */
export function selectionToDraft(
  startStr: string,
  endStr: string,
  allDay: boolean,
  timeZone: string,
): Draft {
  if (allDay) {
    const last = DateTime.fromISO(endStr, { zone: "utc" }).minus({ days: 1 });
    return {
      allDay,
      date: startStr.slice(0, 10),
      startTime: "09:00",
      endDate: (last.isValid && last >= DateTime.fromISO(startStr, { zone: "utc" })
        ? last
        : DateTime.fromISO(startStr, { zone: "utc" })
      ).toISODate()!,
      endTime: "10:00",
    };
  }
  const start = DateTime.fromISO(startStr, { setZone: false }).setZone(timeZone);
  const end = DateTime.fromISO(endStr).setZone(timeZone);
  return {
    allDay,
    date: start.toISODate()!,
    startTime: start.toFormat("HH:mm"),
    endDate: end.toISODate()!,
    endTime: end.toFormat("HH:mm"),
  };
}

/** Default draft for the "New card" button: today, next full hour, one hour long. */
export function defaultDraft(now: Date, timeZone: string): Draft {
  const start = DateTime.fromJSDate(now).setZone(timeZone).plus({ hours: 1 }).startOf("hour");
  const end = start.plus({ hours: 1 });
  return {
    allDay: false,
    date: start.toISODate()!,
    startTime: start.toFormat("HH:mm"),
    endDate: end.toISODate()!,
    endTime: end.toFormat("HH:mm"),
  };
}

/** Converts a calendar event (named time zone) into the API shape. */
export function eventToRange(event: { startStr: string; endStr: string; allDay: boolean }) {
  const toIso = (s: string) =>
    event.allDay ? `${s.slice(0, 10)}T00:00:00.000Z` : new Date(s).toISOString();
  return { start: toIso(event.startStr), end: toIso(event.endStr), allDay: event.allDay };
}
