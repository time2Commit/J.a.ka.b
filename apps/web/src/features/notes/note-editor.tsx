"use client";

import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import { Collaboration } from "@tiptap/extension-collaboration";
import { EditorContent, useEditor } from "@tiptap/react";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { getExtensions, NOTE_FIELD, noteDocumentName } from "@jakab/editor";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import * as Y from "yjs";
import { cn } from "@/lib/utils";
import { NoteToolbar } from "./note-toolbar";

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

/** Collaborative editor for a project note (Yjs document `project:<id>` on the collab server). */
export function NoteEditor({
  projectId,
  user,
  collabUrl,
}: {
  projectId: string;
  user: NoteUser;
  collabUrl: string;
}) {
  const t = useTranslations("Note");
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [peers, setPeers] = useState<Peer[]>([]);

  // One Yjs document and provider per note; they live as long as the editor is mounted.
  const { doc, provider } = useMemo(() => {
    const doc = new Y.Doc();
    const provider = new HocuspocusProvider({
      url: collabUrl,
      name: noteDocumentName(projectId),
      document: doc,
      // The session travels in the (HttpOnly) cookie; the collab server validates that.
      token: "session",
    });
    return { doc, provider };
  }, [collabUrl, projectId]);

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
      provider.destroy();
      doc.destroy();
    };
  }, [provider, doc]);

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        ...getExtensions({ placeholder: t("placeholder") }),
        Collaboration.configure({ document: doc, field: NOTE_FIELD }),
        CollaborationCaret.configure({ provider, user }),
      ],
      editorProps: {
        attributes: { class: "jakab-note focus:outline-none", "aria-label": t("placeholder") },
      },
    },
    [doc, provider],
  );

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
        {editor && <NoteToolbar editor={editor} />}
        <div className="px-4 py-3 md:px-8 md:py-6">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
