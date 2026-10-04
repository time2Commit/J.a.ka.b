/** Statuses created on first run; admins can edit them afterwards. */
export const DEFAULT_STATUSES = [
  { name: "To do", color: "#64748b", order: 0, isDone: false },
  { name: "In progress", color: "#3b82f6", order: 1, isDone: false },
  { name: "Blocked", color: "#ef4444", order: 2, isDone: false },
  { name: "Done", color: "#22c55e", order: 3, isDone: true },
] as const;
