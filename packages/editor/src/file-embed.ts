import { mergeAttributes, Node } from "@tiptap/core";

/**
 * A file placed in the note, exactly where it was dropped or pasted.
 * The bytes live in the attachment store; the note only keeps the reference.
 * Rendering (inline image, PDF preview, download chip) is done by the web app's node view.
 */
export const FileEmbed = Node.create({
  name: "fileEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      attachmentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-attachment-id"),
        renderHTML: (attrs) => ({ "data-attachment-id": attrs.attachmentId }),
      },
      name: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-name") ?? "",
        renderHTML: (attrs) => ({ "data-name": attrs.name }),
      },
      mime: {
        default: "application/octet-stream",
        parseHTML: (el) => el.getAttribute("data-mime") ?? "application/octet-stream",
        renderHTML: (attrs) => ({ "data-mime": attrs.mime }),
      },
      size: {
        default: 0,
        parseHTML: (el) => Number(el.getAttribute("data-size") ?? 0),
        renderHTML: (attrs) => ({ "data-size": String(attrs.size) }),
      },
      /** Display width in px for images (null = natural/auto). */
      width: {
        default: null,
        parseHTML: (el) => {
          const width = el.getAttribute("data-width");
          return width ? Number(width) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { "data-width": String(attrs.width) } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-file-embed]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-file-embed": "" })];
  },
});
