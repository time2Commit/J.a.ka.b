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
