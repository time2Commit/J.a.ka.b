import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface UploadedFile {
  attachmentId: string;
  name: string;
  mime: string;
  size: number;
}

const placeholders = new PluginKey<DecorationSet>("fileUploadPlaceholders");

type Meta = { add: { id: object; pos: number } } | { remove: { id: object } };

type Upload = (file: File) => Promise<UploadedFile | null>;

/** Uploads `files` and inserts a `fileEmbed` after the block that holds position `at`. */
function insertFiles(editor: Editor, upload: Upload, files: File[], at: number) {
  const { state, dispatch } = editor.view;
  const $pos = state.doc.resolve(at);
  // Embeds are blocks: never inside a paragraph, so go after the block holding the position.
  const pos = $pos.parent.isTextblock ? $pos.after() : at;

  for (const file of files) {
    const id = {};
    dispatch(editor.view.state.tr.setMeta(placeholders, { add: { id, pos } } satisfies Meta));
    void upload(file).then((uploaded) => {
      const found = placeholders
        .getState(editor.view.state)
        ?.find(undefined, undefined, (spec) => spec.id === id);
      const target = found?.[0]?.from;
      editor.view.dispatch(
        editor.view.state.tr.setMeta(placeholders, { remove: { id } } satisfies Meta),
      );
      if (!uploaded || target === undefined) return;
      const atEnd = target >= editor.state.doc.content.size;
      editor
        .chain()
        .insertContentAt(target, [
          { type: "fileEmbed", attrs: uploaded },
          ...(atEnd ? [{ type: "paragraph" }] : []),
        ])
        .run();
    });
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fileUpload: {
      /** Uploads the files and inserts them after the block holding the cursor. */
      uploadFiles: (files: File[]) => ReturnType;
    };
  }
}

/**
 * Drop or paste files into the note: each file is uploaded, then a `fileEmbed` block is inserted
 * where the file was dropped (or at the cursor). A placeholder marks the spot while uploading and
 * follows the text if other people keep typing in the meantime.
 */
export const FileUpload = Extension.create<{ upload: Upload }>({
  name: "fileUpload",

  addOptions() {
    return { upload: async () => null };
  },

  addCommands() {
    return {
      uploadFiles:
        (files) =>
        ({ editor }) => {
          insertFiles(editor, this.options.upload, files, editor.state.selection.to);
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    const { upload } = this.options;
    const editor = this.editor;

    return [
      new Plugin({
        key: placeholders,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(placeholders) as Meta | undefined;
            let next = set.map(tr.mapping, tr.doc);
            if (meta && "add" in meta) {
              const widget = document.createElement("div");
              widget.className = "jakab-upload-placeholder";
              next = next.add(tr.doc, [
                Decoration.widget(meta.add.pos, widget, { id: meta.add.id, side: -1 }),
              ]);
            } else if (meta && "remove" in meta) {
              next = next.remove(
                next.find(undefined, undefined, (spec) => spec.id === meta.remove.id),
              );
            }
            return next;
          },
        },
        props: {
          decorations: (state) => placeholders.getState(state),
          handleDrop(view, event) {
            const files = Array.from(event.dataTransfer?.files ?? []);
            if (files.length === 0 || !view.editable) return false;
            event.preventDefault();
            const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
            insertFiles(editor, upload, files, coords?.pos ?? view.state.selection.to);
            return true;
          },
          handlePaste(view, event) {
            const files = Array.from(event.clipboardData?.files ?? []);
            if (files.length === 0 || !view.editable) return false;
            event.preventDefault();
            insertFiles(editor, upload, files, view.state.selection.to);
            return true;
          },
        },
      }),
    ];
  },
});
