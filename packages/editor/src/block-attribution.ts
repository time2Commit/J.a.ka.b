import { combineTransactionSteps, Extension, getChangedRanges } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { ySyncPluginKey } from "@tiptap/y-tiptap";

/** Block types that carry `lastEditedBy` / `lastEditedAt`. */
export const ATTRIBUTED_BLOCKS = ["paragraph", "heading", "codeBlock", "fileEmbed"];

export const blockAttributionKey = new PluginKey("blockAttribution");

export interface AttributionUser {
  id: string;
}

/**
 * Does the change `[from, to]` (positions in the new document) touch this block?
 * - the block was created inside the range (its opening token is within it), or
 * - the range overlaps its content by at least one position, or
 * - the range is empty (a deletion) and sits inside or at the edge of its content.
 * A range that merely ends at the block's edge (Enter pressed at the end of a paragraph)
 * does not make the existing block "edited".
 */
function touchesBlock(pos: number, nodeSize: number, from: number, to: number): boolean {
  const contentStart = pos + 1;
  const contentEnd = pos + nodeSize - 1;
  if (from === to) return from >= contentStart && from <= contentEnd;
  if (pos >= from && pos < to) return true;
  return Math.min(contentEnd, to) - Math.max(contentStart, from) > 0;
}

/**
 * Stamps the given ranges: every attributed block touched by `ranges` gets the user and time.
 * A block already stamped by the same user is refreshed at most every `refreshMs`, so typing
 * does not produce one extra document change per keystroke.
 */
export function stampBlocks(
  state: EditorState,
  ranges: { from: number; to: number }[],
  user: AttributionUser,
  now: number,
  refreshMs: number,
): Transaction | null {
  const tr = state.tr;
  const size = state.doc.content.size;
  const seen = new Set<number>();
  for (const { from, to } of ranges) {
    state.doc.nodesBetween(Math.max(0, from - 1), Math.min(size, to + 1), (node, pos) => {
      if (!ATTRIBUTED_BLOCKS.includes(node.type.name) || seen.has(pos)) return;
      if (!touchesBlock(pos, node.nodeSize, from, to)) return;
      seen.add(pos);
      const { lastEditedBy, lastEditedAt } = node.attrs as {
        lastEditedBy: string | null;
        lastEditedAt: number | null;
      };
      const fresh =
        lastEditedBy === user.id && lastEditedAt !== null && now - lastEditedAt < refreshMs;
      if (fresh) return;
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, lastEditedBy: user.id, lastEditedAt: now });
    });
  }
  if (!tr.docChanged) return null;
  return tr.setMeta(blockAttributionKey, true).setMeta("addToHistory", false);
}

/**
 * Records who changed each block and when ("Edited by Mario · 10:42" on hover).
 * Only local edits are stamped: changes arriving from other users are already stamped by them.
 * Without `getUser` the extension only declares the attributes (server side / export).
 */
export const BlockAttribution = Extension.create<{
  getUser: (() => AttributionUser | null) | null;
  refreshMs: number;
  now: () => number;
}>({
  name: "blockAttribution",

  addOptions() {
    return { getUser: null, refreshMs: 30_000, now: () => Date.now() };
  },

  addGlobalAttributes() {
    return [
      {
        types: ATTRIBUTED_BLOCKS,
        attributes: {
          lastEditedBy: {
            default: null,
            parseHTML: (el) => el.getAttribute("data-edited-by"),
            renderHTML: (attrs) =>
              attrs.lastEditedBy ? { "data-edited-by": attrs.lastEditedBy } : {},
          },
          lastEditedAt: {
            default: null,
            parseHTML: (el) => {
              const value = el.getAttribute("data-edited-at");
              return value ? Number(value) : null;
            },
            renderHTML: (attrs) =>
              attrs.lastEditedAt ? { "data-edited-at": String(attrs.lastEditedAt) } : {},
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    const { getUser, refreshMs, now } = this.options;
    return [
      new Plugin({
        key: blockAttributionKey,
        appendTransaction(transactions, oldState, newState) {
          const user = getUser?.();
          if (!user) return null;
          const local = transactions.filter(
            (tr) =>
              tr.docChanged &&
              !tr.getMeta(blockAttributionKey) &&
              !(tr.getMeta(ySyncPluginKey) as { isChangeOrigin?: boolean } | undefined)
                ?.isChangeOrigin,
          );
          if (local.length === 0) return null;
          const combined = combineTransactionSteps(oldState.doc, local);
          const ranges = getChangedRanges(combined).map(({ newRange }) => newRange);
          return stampBlocks(newState, ranges, user, now(), refreshMs);
        },
      }),
    ];
  },
});
