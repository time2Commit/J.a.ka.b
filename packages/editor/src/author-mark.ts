import { Mark } from "@tiptap/core";

/**
 * Used only while "Show authors" is on: the sync layer renders the document from a snapshot and
 * wraps every run of text in this mark, carrying the author and their color.
 * The name `ychange` is fixed by the sync library.
 */
export const AuthorMark = Mark.create({
  name: "ychange",
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      user: { default: null },
      type: { default: null },
      color: { default: null },
    };
  },

  parseHTML: () => [],

  renderHTML({ mark }) {
    const color = (mark.attrs.color as { light?: string } | null)?.light ?? "#6366f1";
    return [
      "span",
      {
        class: "jakab-author",
        "data-author": String(mark.attrs.user ?? ""),
        style: `--author-color: ${color}`,
      },
      0,
    ];
  },
});
