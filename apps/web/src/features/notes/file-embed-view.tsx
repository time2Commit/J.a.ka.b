"use client";

import { fileKind, formatBytes, FileEmbed } from "@jakab/editor";
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from "@tiptap/react";
import { Download, File as FileIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";

const fileUrl = (id: string, download = false) =>
  `/api/attachments/${id}${download ? "?download=1" : ""}`;

function FileEmbedView({ node, updateAttributes, editor, selected }: NodeViewProps) {
  const t = useTranslations("Note.files");
  const { attachmentId, name, mime, size, width } = node.attrs as {
    attachmentId: string;
    name: string;
    mime: string;
    size: number;
    width: number | null;
  };
  const kind = fileKind(mime);
  const imageRef = useRef<HTMLImageElement>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  function startResize(event: React.PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const image = imageRef.current;
    if (!image) return;
    const startX = event.clientX;
    const startWidth = image.getBoundingClientRect().width;
    const max = image.parentElement?.getBoundingClientRect().width ?? startWidth;
    let current = startWidth;
    const onMove = (e: PointerEvent) => {
      current = Math.round(Math.min(max, Math.max(80, startWidth + e.clientX - startX)));
      setDragWidth(current);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragWidth(null);
      updateAttributes({ width: current });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return (
    <NodeViewWrapper
      data-file-embed=""
      data-attachment-id={attachmentId}
      className={`my-3 rounded-lg border bg-card p-2 ${selected ? "ring-2 ring-ring" : ""}`}
    >
      {kind === "image" && (
        <div className="relative inline-block max-w-full" contentEditable={false}>
          <img
            ref={imageRef}
            src={fileUrl(attachmentId)}
            alt={name}
            loading="lazy"
            draggable={false}
            style={{ width: dragWidth ?? width ?? undefined }}
            className="block h-auto max-w-full rounded-md"
          />
          {editor.isEditable && (
            <button
              type="button"
              aria-label={t("resize")}
              onPointerDown={startResize}
              className="absolute right-1 bottom-1 size-4 cursor-nwse-resize rounded-sm border bg-background/90 shadow"
            />
          )}
        </div>
      )}
      {kind === "pdf" && (
        <object
          data={fileUrl(attachmentId)}
          type="application/pdf"
          aria-label={t("preview", { name })}
          className="h-[28rem] w-full rounded-md"
          contentEditable={false}
        />
      )}
      <div className="mt-1 flex items-center gap-2 text-sm" contentEditable={false}>
        <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(size)}</span>
        <a
          href={fileUrl(attachmentId, true)}
          download={name}
          className="flex shrink-0 items-center gap-1 text-xs text-primary hover:underline"
          style={{ textDecoration: "none" }}
        >
          <Download className="size-3.5" /> {t("download")}
        </a>
      </div>
    </NodeViewWrapper>
  );
}

/** The shared `fileEmbed` node plus its React rendering (inline image, PDF preview, download chip). */
export const FileEmbedWithView = FileEmbed.extend({
  addNodeView() {
    return ReactNodeViewRenderer(FileEmbedView);
  },
});
