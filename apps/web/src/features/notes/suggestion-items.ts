/** Lowercase, accents stripped: "Città" matches "citta". */
export const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export interface MentionCandidate {
  id: string;
  name: string;
  color: string;
}

export const MENTION_LIMIT = 6;

/** People matching what was typed after `@`: names starting with it first, then containing it. */
export function filterMentions(users: MentionCandidate[], query: string): MentionCandidate[] {
  const q = fold(query);
  const starts: MentionCandidate[] = [];
  const contains: MentionCandidate[] = [];
  for (const user of users) {
    const name = fold(user.name);
    const words = name.split(/\s+/);
    if (name.startsWith(q) || words.some((w) => w.startsWith(q))) starts.push(user);
    else if (name.includes(q)) contains.push(user);
  }
  return [...starts, ...contains].slice(0, MENTION_LIMIT);
}

export interface SlashItem {
  id: string;
  label: string;
  /** Extra words that also match (in any language). */
  keywords: string[];
}

/** Commands matching what was typed after `/`; an empty query lists everything. */
export function filterSlashItems<T extends SlashItem>(items: T[], query: string): T[] {
  const q = fold(query);
  if (!q) return items;
  return items.filter((item) =>
    [item.label, ...item.keywords].some((text) => fold(text).includes(q)),
  );
}
