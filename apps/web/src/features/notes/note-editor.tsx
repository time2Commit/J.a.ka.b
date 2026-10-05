"use client";

import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { EditorContent, useEditor } from "@tiptap/react";
import { ySyncPluginKey } from "@tiptap/y-tiptap";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { getExtensions, NOTE_FIELD, noteDocumentName } from "@jakab/editor";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import * as Y from "yjs";
import { cn } from "@/lib/utils";
import { FileEmbedWithView } from "./file-embed-view";
import { FileUpload, type UploadedFile } from "./file-upload";
import { createMentionExtension } from "./mention-extension";
import { pickFiles, SlashCommand, type SlashCommandItem } from "./slash-command";
import { NoteToolbar } from "./note-toolbar";
import { SaveVersionDialog } from "./save-version-dialog";
import { VersionHistory } from "./version-history";

export interface NoteUser {
  id: string;
  name: string;
  color: string;
}

type ConnectionStatus = "connecting" | "connected" | "offline";

interface Peer {
  clientId: number;
  user: NoteUser;
  isSelf: boolean;
}

interface EditedLabel {
  top: number;
  left: number;
  text: string;
}

interface Session {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  permanentUserData: Y.PermanentUserData;
  colorMapping: Map<string, { light: string; dark: string }>;
}

interface NoteEditorProps {
  projectId: string;
  user: NoteUser;
  /** Everybody who can edit, to resolve authors by id. */
  users: NoteUser[];
  collabUrl: string;
}

/**
 * Collaborative editor for a project note (Yjs document `project:<id>` on the collab server).
 * The connection is opened in an effect, so it only ever exists in the browser: creating it while
 * rendering would also open (and leak) a socket from the server-side render, and would break when
 * React re-runs effects in development.
 */
export function NoteEditor(props: NoteEditorProps) {
  const { projectId, user, collabUrl } = props;
  const [session, setSession] = useState<Session | null>(null);
  // Users only color the authors: a changed list must not recreate the connection.
  const usersRef = useRef(props.users);
  usersRef.current = props.users;

  useEffect(() => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collabUrl,
      name: noteDocumentName(projectId),
      document: doc,
      // The session travels in the (HttpOnly) cookie; the collab server validates that.
      token: "session",
    });
    // Remembers which user each Yjs client id belongs to: this powers "Show authors".
    const permanentUserData = new Y.PermanentUserData(doc, doc.getMap("users"));
    permanentUserData.setUserMapping(doc, doc.clientID, user.id);
    const colorMapping = new Map(
      usersRef.current.map((u) => [u.id, { light: u.color, dark: u.color }]),
    );
    setSession({ doc, provider, permanentUserData, colorMapping });
    return () => {
      setSession(null);
      provider.destroy();
      doc.destroy();
    };
  }, [collabUrl, projectId, user.id]);

  if (!session) {
    return <div aria-busy className="h-96 animate-pulse rounded-xl border bg-muted/40" />;
  }
  return <NoteEditorView {...props} session={session} />;
}

function NoteEditorView({
  projectId,
  user,
  users,
  session,
}: NoteEditorProps & { session: Session }) {
  const { doc, provider, permanentUserData, colorMapping } = session;
  const t = useTranslations("Note");
  const format = useFormatter();
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [peers, setPeers] = useState<Peer[]>([]);
  const [showAuthors, setShowAuthors] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [legend, setLegend] = useState<NoteUser[]>([]);
  const [edited, setEdited] = useState<EditedLabel | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onStatus = ({ status }: { status: string }) =>
      setStatus(
        status === "connected" ? "connected" : status === "connecting" ? "connecting" : "offline",
      );
    const onAwareness = () => {
      const states = provider.awareness?.getStates() ?? new Map();
      const self = provider.awareness?.clientID;
      const list: Peer[] = [];
      states.forEach((state, clientId) => {
        const u = (state as { user?: NoteUser }).user;
        if (u) list.push({ clientId, user: u, isSelf: clientId === self });
      });
      setPeers(list);
    };
    provider.on("status", onStatus);
    provider.on("awarenessChange", onAwareness);
    return () => {
      provider.off("status", onStatus);
      provider.off("awarenessChange", onAwareness);
    };
  }, [provider]);

  const upload = useCallback(
    async (file: File): Promise<UploadedFile | null> => {
      const attempt = fetch(`/api/projects/${projectId}/attachments`, {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      }).then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const a = (await res.json()) as { id: string; name: string; mime: string; size: number };
        return { attachmentId: a.id, name: a.name, mime: a.mime, size: a.size };
      });
      toast.promise(attempt, {
        loading: t("files.uploading", { name: file.name }),
        success: t("files.uploaded", { name: file.name }),
        error: (error: Error) =>
          error.message === "413"
            ? t("files.tooLarge", { name: file.name })
            : t("files.failed", { name: file.name }),
      });
      return attempt.catch(() => null);
    },
    [projectId, t],
  );

  // Latest slash items, read lazily by the extension (the editor is created only once).
  const slashItems = useRef<SlashCommandItem[]>([]);
  slashItems.current = [
    {
      id: "h1",
      label: t("toolbar.h1"),
      keywords: ["heading", "title", "titolo"],
      run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 1 }).run(),
    },
    {
      id: "h2",
      label: t("toolbar.h2"),
      keywords: ["heading", "title", "titolo"],
      run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 2 }).run(),
    },
    {
      id: "h3",
      label: t("toolbar.h3"),
      keywords: ["heading", "title", "titolo"],
      run: (e, r) => e.chain().focus().deleteRange(r).toggleHeading({ level: 3 }).run(),
    },
    {
      id: "bullet",
      label: t("toolbar.bulletList"),
      keywords: ["list", "elenco", "puntato"],
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBulletList().run(),
    },
    {
      id: "ordered",
      label: t("toolbar.orderedList"),
      keywords: ["number", "numerato", "elenco"],
      run: (e, r) => e.chain().focus().deleteRange(r).toggleOrderedList().run(),
    },
    {
      id: "task",
      label: t("toolbar.taskList"),
      keywords: ["checklist", "todo", "task", "attivita"],
      run: (e, r) => e.chain().focus().deleteRange(r).toggleTaskList().run(),
    },
    {
      id: "quote",
      label: t("toolbar.quote"),
      keywords: ["quote", "citazione"],
      run: (e, r) => e.chain().focus().deleteRange(r).toggleBlockquote().run(),
    },
    {
      id: "code",
      label: t("toolbar.codeBlock"),
      keywords: ["code", "codice"],
      run: (e, r) => e.chain().focus().deleteRange(r).toggleCodeBlock().run(),
    },
    {
      id: "table",
      label: t("toolbar.table"),
      keywords: ["table", "tabella"],
      run: (e, r) =>
        e
          .chain()
          .focus()
          .deleteRange(r)
          .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
          .run(),
    },
    {
      id: "rule",
      label: t("toolbar.rule"),
      keywords: ["divider", "rule", "line", "linea", "separatore"],
      run: (e, r) => e.chain().focus().deleteRange(r).setHorizontalRule().run(),
    },
    {
      id: "file",
      label: t("toolbar.attach"),
      keywords: ["file", "attach", "allega", "upload"],
      run: (e, r) => {
        e.chain().focus().deleteRange(r).run();
        void pickFiles().then(
          (files) => files.length > 0 && e.chain().focus().uploadFiles(files).run(),
        );
      },
    },
  ];

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        ...getExtensions({
          placeholder: t("placeholder"),
          getUser: () => ({ id: user.id }),
          fileEmbed: FileEmbedWithView,
          mention: createMentionExtension(users, t("suggestions.people")),
        }),
        Collaboration.configure({
          document: doc,
          field: NOTE_FIELD,
          ySyncOptions: { permanentUserData, colorMapping },
        }),
        CollaborationCaret.configure({ provider, user }),
        FileUpload.configure({ upload }),
        SlashCommand.configure({
          getItems: () => slashItems.current,
          listLabel: t("suggestions.blocks"),
        }),
      ],
      editorProps: {
        attributes: { class: "jakab-note focus:outline-none", "aria-label": t("placeholder") },
      },
    },
    [doc, provider],
  );

  /** "Show authors": re-render the document from a snapshot where every run of text carries its author. */
  function toggleAuthors() {
    if (!editor) return;
    const next = !showAuthors;
    if (next) {
      editor.setEditable(false);
      editor.view.dispatch(
        editor.state.tr.setMeta(ySyncPluginKey, {
          snapshot: Y.snapshot(doc),
          prevSnapshot: Y.emptySnapshot,
        }),
      );
    } else {
      // Rebuild the live document from Yjs first (the tinted view was only a rendering), then unlock.
      (
        ySyncPluginKey.getState(editor.state) as
          { binding?: { unrenderSnapshot(): void } } | undefined
      )?.binding?.unrenderSnapshot();
      editor.setEditable(true);
    }
    setShowAuthors(next);
    setEdited(null);
    setTimeout(() => {
      const ids = new Set(
        [...(containerRef.current?.querySelectorAll<HTMLElement>("[data-author]") ?? [])].map(
          (el) => el.dataset.author ?? "",
        ),
      );
      setLegend(next ? users.filter((u) => ids.has(u.id)) : []);
    }, 150);
  }

  /** Margin label for the block under the pointer: "Edited by Mario · 10:42". */
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const container = containerRef.current;
    const block = (event.target as HTMLElement).closest<HTMLElement>("[data-edited-by]");
    if (!container || !block || showAuthors) return setEdited(null);
    const at = Number(block.dataset.editedAt);
    const author = users.find((u) => u.id === block.dataset.editedBy)?.name ?? t("unknownUser");
    const box = block.getBoundingClientRect();
    const origin = container.getBoundingClientRect();
    setEdited({
      top: box.top - origin.top - 20,
      left: box.left - origin.left,
      text: t("edited", {
        name: author,
        time: at ? format.dateTime(new Date(at), { dateStyle: "short", timeStyle: "short" }) : "",
      }),
    });
  }

  // Deduplicate peers by user (one person may have several tabs open).
  const people = [...new Map(peers.map((p) => [p.user.id, p])).values()];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="status"
          data-testid="note-status"
          data-status={status}
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <span
            className={cn(
              "size-2 rounded-full",
              status === "connected" && "bg-green-500",
              status === "connecting" && "bg-amber-500",
              status === "offline" && "bg-red-500",
            )}
          />
          {t(`status.${status}`)}
        </div>
        <div className="flex items-center gap-2" aria-label={t("online", { count: people.length })}>
          <span className="text-xs text-muted-foreground">
            {t("online", { count: people.length })}
          </span>
          <div className="flex -space-x-1.5">
            {people.map((p) => (
              <span
                key={p.user.id}
                title={p.isSelf ? `${p.user.name} (${t("you")})` : p.user.name}
                className="flex size-7 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-background"
                style={{ backgroundColor: p.user.color }}
              >
                {p.user.name.slice(0, 1).toUpperCase()}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {editor && (
          <NoteToolbar
            editor={editor}
            showAuthors={showAuthors}
            onToggleAuthors={toggleAuthors}
            onAttach={(files) => editor.chain().focus().uploadFiles(files).run()}
            onSaveVersion={() => setSaveOpen(true)}
            onOpenHistory={() => setHistoryOpen(true)}
          />
        )}
        {showAuthors && (
          <div
            className="flex flex-wrap items-center gap-3 border-b bg-muted/40 px-4 py-2 text-xs"
            role="status"
          >
            <span className="font-medium">{t("authorsLegend")}</span>
            {legend.map((u) => (
              <span key={u.id} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: u.color }} />
                {u.name}
              </span>
            ))}
            <span className="text-muted-foreground">{t("authorsReadOnly")}</span>
          </div>
        )}
        <div
          ref={containerRef}
          className="relative px-4 py-3 md:px-8 md:py-6"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setEdited(null)}
        >
          <EditorContent editor={editor} />
          {edited && (
            <div
              role="tooltip"
              data-testid="edited-label"
              className="pointer-events-none absolute z-10 rounded bg-foreground px-2 py-0.5 text-xs whitespace-nowrap text-background shadow"
              style={{ top: edited.top, left: edited.left }}
            >
              {edited.text}
            </div>
          )}
        </div>
      </div>
      <SaveVersionDialog projectId={projectId} open={saveOpen} onOpenChange={setSaveOpen} />
      <VersionHistory
        projectId={projectId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        getCurrentJson={() => editor?.getJSON() ?? { type: "doc", content: [] }}
      />
    </div>
  );
}
