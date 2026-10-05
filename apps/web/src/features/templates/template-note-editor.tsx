"use client";

import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { getExtensions } from "@jakab/editor";
import { useTranslations } from "next-intl";
import { NoteToolbar } from "@/features/notes/note-toolbar";

/**
 * The note editor without collaboration: the initial content of a template. No files, authors or
 * versions here; changes are reported through `onChange` and saved with the template.
 */
export function TemplateNoteEditor({
  initial,
  onChange,
}: {
  initial: JSONContent | null;
  onChange: (json: JSONContent) => void;
}) {
  const t = useTranslations("Note");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: getExtensions({ placeholder: t("placeholder"), history: true }),
    content: initial ?? undefined,
    editorProps: {
      attributes: {
        class: "jakab-note focus:outline-none",
        "aria-label": t("placeholder"),
        "data-testid": "template-note",
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });

  return (
    <div className="rounded-lg border bg-card">
      {editor && <NoteToolbar editor={editor} />}
      <div className="max-h-72 overflow-y-auto px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
