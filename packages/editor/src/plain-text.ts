import type { JSONContent } from "@tiptap/core";

/** Nodes whose content is one run of text: they end with a line break. */
const BLOCKS = new Set(["paragraph", "heading", "codeBlock", "listItem", "taskItem", "fileEmbed"]);
const CELLS = new Set(["tableCell", "tableHeader"]);

/**
 * The readable text of a note, for searching it: text runs are joined without gaps (a word split
 * by formatting stays one word), blocks end with a line break, mentions read as "@name" and
 * attached files contribute their name.
 */
export function jsonToPlainText(doc: unknown): string {
  const walk = (node: JSONContent): string => {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    if (node.type === "mention") return `@${String(node.attrs?.label ?? node.attrs?.id ?? "")}`;
    if (node.type === "fileEmbed") return `${String(node.attrs?.name ?? "")}\n`;
    const inner = (node.content ?? []).map(walk).join("");
    if (BLOCKS.has(node.type ?? "")) return `${inner}\n`;
    if (CELLS.has(node.type ?? "")) return `${inner} `;
    return inner;
  };
  if (!doc || typeof doc !== "object") return "";
  return walk(doc as JSONContent)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Lower case without accents, one character for one character: the folded text has the same
 * length as the original, so a match found in it points at the same place in the original.
 */
export function foldForSearch(text: string): string {
  let result = "";
  for (const char of text) {
    const folded = char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    // A character that would change length keeps its plain lower-case form.
    result += [...folded].length === 1 ? folded : char.toLowerCase();
  }
  return result;
}
