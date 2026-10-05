import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebStream } from "node:stream/web";
import { badRequest, HttpError } from "@/server/errors";
import { prisma, route } from "@/server/http";
import { parseArchive, previewArchive } from "@/server/import";
import { importMaxBytes, removeImport, saveImportUpload } from "@/server/import-store";
import { openZipFile } from "@/server/zip-reader";

/**
 * Step 1 of an import (admin): the archive is the raw request body. It is stored temporarily,
 * validated, and a preview of what would happen is returned together with an `importId`.
 */
export const POST = route(
  async (req) => {
    if (!req.body) throw badRequest("Empty upload");
    const maxBytes = importMaxBytes();
    if (Number(req.headers.get("content-length") ?? 0) > maxBytes) {
      throw new HttpError(413, "Archive too large");
    }
    const upload = await saveImportUpload(
      Readable.fromWeb(req.body as unknown as NodeWebStream),
      maxBytes,
    );
    try {
      const zip = await openZipFile(upload.path);
      try {
        const preview = await previewArchive(prisma, await parseArchive(zip));
        return NextResponse.json({ importId: upload.id, preview }, { status: 201 });
      } finally {
        zip.close();
      }
    } catch (error) {
      await removeImport(upload.id);
      throw error;
    }
  },
  { admin: true },
);
