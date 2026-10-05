import { Readable } from "node:stream";
import { prisma, route } from "@/server/http";
import { exportProject } from "@/server/export";
import { getStorage } from "@/server/storage";
import { zipResponse } from "@/server/zip-response";

type Params = { id: string };

/** One project (note as Markdown + JSON, attachments, cards) as an importable archive. */
export const GET = route<Params>(async (req, { params }) => {
  const { stream, fileName } = await exportProject(prisma, getStorage(), params.id, {
    includeVersions: new URL(req.url).searchParams.get("versions") === "1",
  });
  return zipResponse(Readable.toWeb(stream) as unknown as ReadableStream, fileName);
});
