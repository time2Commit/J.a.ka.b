"use client";

import { ReactRenderer, type Editor } from "@tiptap/react";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";

export interface PopupItem {
  id: string;
  label: string;
  /** Optional colored dot (people) or secondary text. */
  color?: string;
  hint?: string;
}

interface ListHandle {
  onKeyDown(event: KeyboardEvent): boolean;
}

interface ListProps {
  items: PopupItem[];
  command: (item: PopupItem) => void;
  label: string;
}

const SuggestionList = forwardRef<ListHandle, ListProps>(function SuggestionList(
  { items, command, label },
  ref,
) {
  const [selected, setSelected] = useState(0);
  useEffect(() => setSelected(0), [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (items.length === 0) return false;
      if (event.key === "ArrowDown") {
        setSelected((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        setSelected((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[selected];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) return null;
  return (
    <div
      role="listbox"
      aria-label={label}
      className="max-h-64 min-w-48 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
    >
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === selected}
          // Keep the editor focused: choosing must not move the caret.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => command(item)}
          onMouseEnter={() => setSelected(index)}
          className={cn(
            "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm",
            index === selected && "bg-accent text-accent-foreground",
          )}
        >
          {item.color && (
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: item.color }}
            />
          )}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.hint && <span className="shrink-0 text-xs text-muted-foreground">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
});

/**
 * Tiptap `suggestion.render`: shows the list next to the caret while a trigger (`@`, `/`) is active.
 * The list lives in `document.body` so no editor or layout container can clip it.
 */
export function suggestionRender(label: string) {
  return () => {
    let renderer: ReactRenderer<ListHandle, ListProps> | null = null;
    let host: HTMLDivElement | null = null;

    const place = (props: SuggestionProps<PopupItem>) => {
      const rect = props.clientRect?.();
      if (!host || !rect) return;
      host.style.top = `${rect.bottom + 6}px`;
      host.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
    };

    return {
      onStart(props: SuggestionProps<PopupItem>) {
        renderer = new ReactRenderer(SuggestionList, {
          props: { items: props.items, command: props.command, label },
          editor: props.editor as Editor,
        });
        host = document.createElement("div");
        host.style.cssText = "position:fixed;z-index:60;";
        host.appendChild(renderer.element);
        document.body.appendChild(host);
        place(props);
      },
      onUpdate(props: SuggestionProps<PopupItem>) {
        renderer?.updateProps({ items: props.items, command: props.command, label });
        place(props);
      },
      onKeyDown(props: SuggestionKeyDownProps) {
        if (props.event.key === "Escape") {
          host?.remove();
          return true;
        }
        return renderer?.ref?.onKeyDown(props.event) ?? false;
      },
      onExit() {
        host?.remove();
        renderer?.destroy();
        host = null;
        renderer = null;
      },
    };
  };
}
