import type { JSONContent } from "@tiptap/core";

/** JSON with sorted keys, so two equal documents compare equal whatever the key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export type BlockChange = "same" | "added" | "removed";

export interface BlockDiff {
  /** Every top-level block of both documents, in reading order. */
  doc: JSONContent;
  /** One entry per block of `doc`. */
  changes: BlockChange[];
  /** True when at least one block was added or removed. */
  changed: boolean;
}

/**
 * Block-level comparison of two notes: top-level blocks present only in `before` are "removed",
 * those only in `after` are "added". A block that was edited shows up as one removed plus one
 * added block, next to each other. Blocks are matched with a longest-common-subsequence, so moving
 * text around does not mark everything below it as changed.
 */
export function diffBlocks(before: JSONContent | null, after: JSONContent | null): BlockDiff {
  const a = before?.content ?? [];
  const b = after?.content ?? [];
  const keysA = a.map(canonicalJson);
  const keysB = b.map(canonicalJson);

  // lcs[i][j] = length of the common subsequence of a[i..] and b[j..]
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] =
        keysA[i] === keysB[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }

  const content: JSONContent[] = [];
  const changes: BlockChange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && keysA[i] === keysB[j]) {
      content.push(b[j]!);
      changes.push("same");
      i++;
      j++;
    } else if (i < a.length && (j === b.length || lcs[i + 1]![j]! >= lcs[i]![j + 1]!)) {
      content.push(a[i]!);
      changes.push("removed");
      i++;
    } else {
      content.push(b[j]!);
      changes.push("added");
      j++;
    }
  }
  return {
    doc: { type: "doc", content },
    changes,
    changed: changes.some((c) => c !== "same"),
  };
}
