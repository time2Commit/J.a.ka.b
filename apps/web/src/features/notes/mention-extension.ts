import { Mention } from "@jakab/editor";
import { PluginKey } from "@tiptap/pm/state";
import { filterMentions, type MentionCandidate } from "./suggestion-items";
import { suggestionRender, type PopupItem } from "./suggestion-popup";

/** `@name` mentions: the shared mention node plus the suggestion popup listing the team. */
export function createMentionExtension(users: MentionCandidate[], listLabel: string) {
  return Mention.configure({
    HTMLAttributes: { class: "jakab-mention" },
    suggestion: {
      char: "@",
      pluginKey: new PluginKey("mentionSuggestion"),
      items: ({ query }): PopupItem[] =>
        filterMentions(users, query).map((u) => ({ id: u.id, label: u.name, color: u.color })),
      render: suggestionRender(listLabel),
    },
  });
}
