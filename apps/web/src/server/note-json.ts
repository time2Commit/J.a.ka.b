/** Rewrites ids inside editor JSON (attachments, mentioned people) without touching the rest. */
export interface NoteIdMaps {
  /** New id for an attachment id; unknown ids are returned unchanged. */
  attachment?: (id: string) => string;
  /** New id for a mention; unknown ids are returned unchanged. */
  mention?: (id: string) => string;
}

export function mapNoteIds<T>(node: T, maps: NoteIdMaps): T {
  if (Array.isArray(node)) return node.map((n) => mapNoteIds(n, maps)) as T;
  if (!node || typeof node !== "object") return node;
  const source = node as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) copy[key] = mapNoteIds(value, maps);

  const attrs = copy.attrs as Record<string, unknown> | undefined;
  if (attrs && typeof attrs === "object") {
    if (copy.type === "fileEmbed" && typeof attrs.attachmentId === "string" && maps.attachment) {
      copy.attrs = { ...attrs, attachmentId: maps.attachment(attrs.attachmentId) };
    } else if (copy.type === "mention" && typeof attrs.id === "string" && maps.mention) {
      copy.attrs = { ...attrs, id: maps.mention(attrs.id) };
    }
  }
  return copy as T;
}

interface JsonNode {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: JsonNode[];
  [key: string]: unknown;
}

/**
 * Removes file embeds from a note, except those whose attachment id is in `keep`.
 * Used where a note moves to a place that does not own the files (templates) or where only some
 * of the files could be copied (clones).
 */
export function filterFileEmbeds<T extends object>(
  note: T,
  keep: ReadonlySet<string> = new Set(),
): T {
  const visit = (node: JsonNode): JsonNode => {
    if (!node.content) return node;
    return {
      ...node,
      content: node.content
        .filter(
          (child) =>
            child.type !== "fileEmbed" || keep.has(String(child.attrs?.attachmentId ?? "")),
        )
        .map(visit),
    };
  };
  return visit(note as JsonNode) as T;
}

/** A checklist block (task list) for the top of a note; null when there are no items. */
export function checklistNode(items: string[]): JsonNode | null {
  if (items.length === 0) return null;
  return {
    type: "taskList",
    content: items.map((text) => ({
      type: "taskItem",
      attrs: { checked: false },
      content: [{ type: "paragraph", content: [{ type: "text", text }] }],
    })),
  };
}

/** Initial note of a project made from a template: its content, then its checklist. */
export function noteFromTemplate(note: object | null, checklist: string[]): JsonNode | null {
  const content = [...((note as JsonNode | null)?.content ?? [])];
  const list = checklistNode(checklist);
  if (list) content.push(list);
  return content.length > 0 ? { type: "doc", content } : null;
}
