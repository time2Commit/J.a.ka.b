import { getSchema, type JSONContent } from "@tiptap/core";
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { getExtensions, NOTE_FIELD } from "./extensions";

let schema: ReturnType<typeof getSchema> | undefined;
const noteSchema = () => (schema ??= getSchema(getExtensions()));

/** Readable copy of a collaborative document (stored next to the Yjs state for search and export). */
export function ydocToJson(doc: Y.Doc): JSONContent {
  return yDocToProsemirrorJSON(doc, NOTE_FIELD) as JSONContent;
}

/** Builds a Yjs document from editor JSON (templates, clones, restores). */
export function jsonToYdoc(json: JSONContent): Y.Doc {
  return prosemirrorJSONToYDoc(noteSchema(), json, NOTE_FIELD);
}

/** True when the document has no text and no non-paragraph block. */
export function isEmptyDocument(json: JSONContent | null | undefined): boolean {
  if (!json?.content?.length) return true;
  return json.content.every(
    (node) => node.type === "paragraph" && !(node.content && node.content.length > 0),
  );
}
