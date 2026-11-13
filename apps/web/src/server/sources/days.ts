/** The calendar day (yyyy-MM-dd) an instant falls on in an IANA time zone. */
export function dayInZone(instant: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of a yyyy-MM-dd day: how an all-day event is stored (the board reads the date part). */
export const dayStartUtc = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** The same, for the day after: the (exclusive) end of an all-day event. */
export const nextDayStartUtc = (day: string) => new Date(dayStartUtc(day).getTime() + DAY_MS);

/** yyyy-MM of an instant in UTC (the month a provider's quota is counted in). */
export const monthOf = (instant: Date) => instant.toISOString().slice(0, 7);

/** The first instant of the month after the one `instant` falls in (UTC). */
export const startOfNextMonth = (instant: Date) =>
  new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth() + 1, 1));
