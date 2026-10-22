import { Readable } from "node:stream";
import { attachmentHeaders, getAttachment } from "@/server/attachments";
import { notFound } from "@/server/errors";
import { prisma, route } from "@/server/http";
import { getStorage } from "@/server/storage";

type Params = { id: string };

/** Raster images and PDFs are shown inline, everything else downloads (see `attachmentHeaders`). */
export const GET = route<Params>(async (req, { params }) => {
  const attachment = await getAttachment(prisma, params.id);
  const opened = await getStorage()
    .open(attachment.storageKey)
    .catch(() => {
      throw notFound("File");
    });

  const wantsDownload = new URL(req.url).searchParams.get("download") === "1";
  return new Response(Readable.toWeb(opened.stream) as unknown as ReadableStream, {
    headers: attachmentHeaders(
      { mime: attachment.mime, originalName: attachment.originalName, size: opened.size },
      wantsDownload,
    ),
  });
});
