import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { saveAttachment } from "@/server/attachments";
import { badRequest, HttpError } from "@/server/errors";
import { prisma, route } from "@/server/http";
import { getStorage, maxUploadBytes } from "@/server/storage";

type Params = { id: string };

/**
 * Upload: the raw file is the request body (streamed to disk, never buffered in memory);
 * the name travels in `x-file-name` (URI-encoded) and the type in `content-type`.
 */
export const POST = route<Params>(async (req, { actor, params }) => {
  if (!req.body) throw badRequest("Empty upload");
  const maxBytes = maxUploadBytes();
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) {
    throw new HttpError(413, "File too large");
  }
  let name: string;
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") ?? "file");
  } catch {
    throw badRequest("Invalid file name");
  }
  const attachment = await saveAttachment(prisma, getStorage(), {
    projectId: params.id,
    userId: actor.id,
    name,
    mime: req.headers.get("content-type"),
    // The DOM and Node stream types describe the same object; only the typings differ.
    body: Readable.fromWeb(req.body as unknown as NodeWebStream),
    maxBytes,
  });
  return NextResponse.json(attachment, { status: 201 });
});
