import { Readable } from "node:stream";
import { prisma, route } from "@/server/http";
import { exportBoard } from "@/server/export";
import { LIMITS } from "@/server/rate-limit";
import { getStorage } from "@/server/storage";
import { zipResponse } from "@/server/zip-response";

/** Whole board as one archive (admin). `?versions=1` adds version history, `?archived=1` archived projects. */
export const GET = route(
  async (req) => {
    const params = new URL(req.url).searchParams;
    const { stream, fileName } = await exportBoard(prisma, getStorage(), {
      includeVersions: params.get("versions") === "1",
      includeArchived: params.get("archived") === "1",
    });
    return zipResponse(Readable.toWeb(stream) as unknown as ReadableStream, fileName);
  },
  { admin: true, rateLimit: LIMITS.export },
);
