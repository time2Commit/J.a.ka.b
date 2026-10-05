"use client";

import { Extension, type JSONContent } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import { getExtensions, type BlockChange } from "@jakab/editor";
import { useEffect, useRef } from "react";
import { FileEmbedWithView } from "./file-embed-view";

/** Tints each top-level block by whether it was added or removed (see `diffBlocks`). */
function changeHighlight(getChanges: () => BlockChange[] | null) {
  return Extension.create({
    name: "changeHighlight",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("changeHighlight"),
          props: {
            decorations: (state) => {
              const changes = getChanges();
              if (!changes) return null;
              const decorations: Decoration[] = [];
              state.doc.forEach((node, offset, index) => {
                const change = changes[index];
                if (change && change !== "same") {
                  decorations.push(
                    Decoration.node(offset, offset + node.nodeSize, {
                      class: `jakab-change jakab-change-${change}`,
                      "data-change": change,
                    }),
                  );
                }
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}

/** Read-only rendering of a note version, optionally with per-block change marks. */
export function VersionPreview({
  json,
  changes,
}: {
  json: JSONContent;
  changes?: BlockChange[] | null;
}) {
  // The decorations read the latest changes from a ref, so the editor is never rebuilt.
  const changesRef = useRef<BlockChange[] | null>(changes ?? null);
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    content: json,
    extensions: [
      ...getExtensions({ fileEmbed: FileEmbedWithView }),
      changeHighlight(() => changesRef.current),
    ],
    editorProps: { attributes: { class: "jakab-note", "data-testid": "version-preview" } },
  });

  useEffect(() => {
    if (!editor) return;
    changesRef.current = changes ?? null;
    editor.commands.setContent(json, { emitUpdate: false });
  }, [editor, json, changes]);

  return <EditorContent editor={editor} />;
}
