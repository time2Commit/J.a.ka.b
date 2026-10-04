"use client";

import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Paperclip,
  PenLine,
  Quote,
  Strikethrough,
  Table as TableIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { cn } from "@/lib/utils";

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the editor selection: buttons must not take focus on mouse down.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-40 [&_svg]:size-4",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

const Separator = () => <span className="mx-1 h-5 w-px bg-border" aria-hidden />;

export function NoteToolbar({
  editor,
  showAuthors,
  onToggleAuthors,
  onAttach,
}: {
  editor: Editor;
  showAuthors: boolean;
  onToggleAuthors: () => void;
  onAttach: (files: File[]) => void;
}) {
  const t = useTranslations("Note.toolbar");
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      strike: editor.isActive("strike"),
      code: editor.isActive("code"),
      highlight: editor.isActive("highlight"),
      link: editor.isActive("link"),
      h1: editor.isActive("heading", { level: 1 }),
      h2: editor.isActive("heading", { level: 2 }),
      h3: editor.isActive("heading", { level: 3 }),
      bulletList: editor.isActive("bulletList"),
      orderedList: editor.isActive("orderedList"),
      taskList: editor.isActive("taskList"),
      blockquote: editor.isActive("blockquote"),
      codeBlock: editor.isActive("codeBlock"),
      inTable: editor.isActive("table"),
    }),
  });
  const chain = () => editor.chain().focus();
  const fileInput = useRef<HTMLInputElement>(null);

  function toggleLink() {
    const previous = editor.getAttributes("link").href as string | undefined;
    const href = window.prompt(t("linkPrompt"), previous ?? "https://");
    if (href === null) return;
    if (href.trim() === "") chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: href.trim() }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label={t("label")}
      className="flex flex-wrap items-center justify-between gap-0.5 border-b px-2 py-1.5"
    >
      {/* Disabled as a whole while authors are shown (the note is read-only then). */}
      <fieldset disabled={showAuthors} className="flex flex-wrap items-center gap-0.5">
        <ToolButton
          label={t("h1")}
          active={s.h1}
          onClick={() => chain().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 />
        </ToolButton>
        <ToolButton
          label={t("h2")}
          active={s.h2}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 />
        </ToolButton>
        <ToolButton
          label={t("h3")}
          active={s.h3}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 />
        </ToolButton>
        <Separator />
        <ToolButton label={t("bold")} active={s.bold} onClick={() => chain().toggleBold().run()}>
          <Bold />
        </ToolButton>
        <ToolButton
          label={t("italic")}
          active={s.italic}
          onClick={() => chain().toggleItalic().run()}
        >
          <Italic />
        </ToolButton>
        <ToolButton
          label={t("strike")}
          active={s.strike}
          onClick={() => chain().toggleStrike().run()}
        >
          <Strikethrough />
        </ToolButton>
        <ToolButton label={t("code")} active={s.code} onClick={() => chain().toggleCode().run()}>
          <Code />
        </ToolButton>
        <ToolButton
          label={t("highlight")}
          active={s.highlight}
          onClick={() => chain().toggleHighlight({ color: "#fde68a" }).run()}
        >
          <Highlighter />
        </ToolButton>
        <ToolButton label={t("link")} active={s.link} onClick={toggleLink}>
          <LinkIcon />
        </ToolButton>
        <Separator />
        <ToolButton
          label={t("bulletList")}
          active={s.bulletList}
          onClick={() => chain().toggleBulletList().run()}
        >
          <List />
        </ToolButton>
        <ToolButton
          label={t("orderedList")}
          active={s.orderedList}
          onClick={() => chain().toggleOrderedList().run()}
        >
          <ListOrdered />
        </ToolButton>
        <ToolButton
          label={t("taskList")}
          active={s.taskList}
          onClick={() => chain().toggleTaskList().run()}
        >
          <ListChecks />
        </ToolButton>
        <Separator />
        <ToolButton
          label={t("quote")}
          active={s.blockquote}
          onClick={() => chain().toggleBlockquote().run()}
        >
          <Quote />
        </ToolButton>
        <ToolButton
          label={t("codeBlock")}
          active={s.codeBlock}
          onClick={() => chain().toggleCodeBlock().run()}
        >
          <Code2 />
        </ToolButton>
        <ToolButton label={t("rule")} onClick={() => chain().setHorizontalRule().run()}>
          <Minus />
        </ToolButton>
        <ToolButton
          label={t("table")}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon />
        </ToolButton>
        {s.inTable && (
          <>
            <ToolButton label={t("addRow")} onClick={() => chain().addRowAfter().run()}>
              <span className="text-xs font-semibold">+R</span>
            </ToolButton>
            <ToolButton label={t("addColumn")} onClick={() => chain().addColumnAfter().run()}>
              <span className="text-xs font-semibold">+C</span>
            </ToolButton>
            <ToolButton label={t("deleteTable")} onClick={() => chain().deleteTable().run()}>
              <span className="text-xs font-semibold">×T</span>
            </ToolButton>
          </>
        )}
        <ToolButton label={t("attach")} onClick={() => fileInput.current?.click()}>
          <Paperclip />
        </ToolButton>
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          data-testid="file-input"
          aria-label={t("attach")}
          onChange={(e) => {
            onAttach(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </fieldset>
      <ToolButton label={t("authors")} active={showAuthors} onClick={onToggleAuthors}>
        <PenLine />
      </ToolButton>
    </div>
  );
}
