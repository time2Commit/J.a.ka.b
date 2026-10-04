import { Highlight } from "@tiptap/extension-highlight";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import type { AnyExtension } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { AuthorMark } from "./author-mark";
import { BlockAttribution, type AttributionUser } from "./block-attribution";
import { FileEmbed } from "./file-embed";

/** Name of the Yjs XML fragment holding the note content. */
export const NOTE_FIELD = "default";

/**
 * The note schema, shared by the web editor, the collaboration server and the export.
 * Every node/mark that ends up in a note must be declared here.
 * `getUser` (web only) turns on block attribution; without it the attributes are only declared.
 * Undo/redo is left to the collaboration extension (per-user undo), hence `undoRedo: false`.
 */
export function getExtensions(
  options: {
    placeholder?: string;
    getUser?: () => AttributionUser | null;
    /** Replaces the plain file embed with a version that has a node view (web only). */
    fileEmbed?: AnyExtension;
  } = {},
): AnyExtension[] {
  return [
    StarterKit.configure({
      undoRedo: false,
      link: { openOnClick: false, autolink: true, defaultProtocol: "https" },
    }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
    options.fileEmbed ?? FileEmbed,
    AuthorMark,
    BlockAttribution.configure({ getUser: options.getUser ?? null }),
    ...(options.placeholder ? [Placeholder.configure({ placeholder: options.placeholder })] : []),
  ];
}
