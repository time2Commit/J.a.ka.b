/** The cached data a board can show; each is a query key root. */
const ALL = ["cards", "meta", "projects", "templates"];

/**
 * What a change to each kind of thing makes out of date. The server names the kind in every
 * event; it is deliberately generous (a status shows on cards, an import can add statuses and
 * labels, …) and only leaves out what cannot be affected.
 */
const AFFECTED: Record<string, string[]> = {
  card: ["cards", "projects"],
  project: ["projects", "cards", "meta"],
  folder: ["projects", "templates"],
  workspace: ["meta"],
  status: ALL,
  label: ALL,
};

/** The query roots to refresh for the payload of a board event; all of them when it is unclear. */
export function queryRootsFor(payload: string): string[] {
  try {
    const { entity } = JSON.parse(payload) as { entity?: unknown };
    if (typeof entity === "string" && AFFECTED[entity]) return AFFECTED[entity];
  } catch {
    // not JSON: fall through
  }
  return ALL;
}
