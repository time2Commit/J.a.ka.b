/** Hocuspocus document name of a project note. */
export const noteDocumentName = (projectId: string) => `project:${projectId}`;

/** Inverse of `noteDocumentName`; null when the name is not a project note. */
export function parseNoteDocumentName(name: string): string | null {
  return name.startsWith("project:") && name.length > "project:".length
    ? name.slice("project:".length)
    : null;
}
