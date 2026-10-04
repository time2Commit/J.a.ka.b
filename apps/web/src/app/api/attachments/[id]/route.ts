// Subpath import: the whole editor package (Tiptap, Yjs) is not needed on this server route.
import { fileKind } from "@jakab/editor/files";
import { Readable } from "node:stream";
import { getAttachment } from "@/server/attachments";
import { notFound } from "@/server/errors";
import { prisma, route } from "@/server/http";
import { getStorage } from "@/server/storage";

type Params = { id: string };

/**
 * Raster images and PDFs are shown inline; everything else is forced to download with a generic
 * type, so an uploaded file can never run as a page of this site.
 */
export const GET = route<Params>(async (req, { params }) => {
  const attachment = await getAttachment(prisma, params.id);
  const opened = await getStorage()
    .open(attachment.storageKey)
    .catch(() => {
      throw notFound("File");
    });

  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";
  const inline = !wantsDownload && fileKind(attachment.mime) !== "file";
  const encoded = encodeURIComponent(attachment.originalName);

  return new Response(Readable.toWeb(opened.stream) as unknown as ReadableStream, {
    headers: {
      "Content-Type": inline ? attachment.mime : "application/octet-stream",
      "Content-Length": String(opened.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`,
      "X-Content-Type-Options": "nosniff",
      // Content never changes for a given id.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
});
