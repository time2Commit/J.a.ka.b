import { Extension, type Editor, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import { filterSlashItems, type SlashItem } from "./suggestion-items";
import { suggestionRender, type PopupItem } from "./suggestion-popup";

export interface SlashCommandItem extends SlashItem {
  run: (editor: Editor, range: Range) => void;
}

/** Opens the system file picker and resolves with the chosen files (empty when cancelled). */
export function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.addEventListener("change", () => resolve(Array.from(input.files ?? [])));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

/** Type `/` to insert a block (heading, list, checklist, table, file…) without leaving the keyboard. */
export const SlashCommand = Extension.create<{
  getItems: () => SlashCommandItem[];
  listLabel: string;
}>({
  name: "slashCommand",

  addOptions() {
    return { getItems: () => [], listLabel: "" };
  },

  addProseMirrorPlugins() {
    const { getItems, listLabel } = this.options;
    return [
      Suggestion<PopupItem, PopupItem>({
        editor: this.editor,
        char: "/",
        pluginKey: new PluginKey("slashSuggestion"),
        // Only at the start of a block or after a space, so "and/or" or URLs are left alone.
        allowedPrefixes: [" "],
        items: ({ query }) =>
          filterSlashItems(getItems(), query).map((i) => ({ id: i.id, label: i.label })),
        command: ({ editor, range, props }) => {
          getItems()
            .find((item) => item.id === props.id)
            ?.run(editor, range);
        },
        render: suggestionRender(listLabel),
      }),
    ];
  },
});
