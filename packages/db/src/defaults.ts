/** Statuses created on first run; admins can edit them afterwards. */
export const DEFAULT_STATUSES = [
  { name: "To do", color: "#64748b", order: 0, isDone: false },
  { name: "In progress", color: "#3b82f6", order: 1, isDone: false },
  { name: "Blocked", color: "#ef4444", order: 2, isDone: false },
  { name: "Done", color: "#22c55e", order: 3, isDone: true },
] as const;

/**
 * Id of the calendar every card belongs to until it is moved. Fixed so the migration can assign
 * existing cards to it; keep in sync with the migration `calendars`.
 */
export const DEFAULT_CALENDAR_ID = "main";

/** The calendar created on first run; admins can rename and recolor it, but not delete it. */
export const DEFAULT_CALENDAR = {
  id: DEFAULT_CALENDAR_ID,
  name: "Main",
  color: "#3b82f6",
  kind: "local",
  isDefault: true,
  order: 0,
} as const;
