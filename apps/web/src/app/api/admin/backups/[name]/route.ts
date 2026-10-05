import { createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { route } from "@/server/http";
import { backupConfig, statBackup } from "@/server/backup";

type Params = { name: string };

/** Downloads one backup file (admin). Only names the backup job creates are accepted. */
export const GET = route<Params>(
  async (_req, { params }) => {
    const { file, size } = await statBackup(backupConfig().dir, params.name);
    return new Response(Readable.toWeb(createReadStream(file)) as unknown as ReadableStream, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(size),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(params.name)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      },
    });
  },
  { admin: true },
);
