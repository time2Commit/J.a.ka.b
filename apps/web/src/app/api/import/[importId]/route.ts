import { importOptionsSchema } from "@jakab/shared";
import { auth } from "@/lib/auth";
import { notFound } from "@/server/errors";
import { parseBody, prisma, route } from "@/server/http";
import { applyArchive, parseArchive } from "@/server/import";
import { importMaxBytes, importPath, removeImport } from "@/server/import-store";
import { getStorage } from "@/server/storage";
import { openZipFile } from "@/server/zip-reader";

type Params = { importId: string };

/** Step 2 (admin): runs the import with the choices made in the preview, then discards the upload. */
export const POST = route<Params>(
  async (req, { actor, params }) => {
    const options = await parseBody(req, importOptionsSchema);
    const zip = await openZipFile(importPath(params.importId)).catch((error: unknown) => {
      if ((error as { status?: number }).status === 400) throw notFound("Import");
      throw error;
    });
    try {
      const parsed = await parseArchive(zip);
      const { password } = await auth.$context;
      const result = await applyArchive(prisma, getStorage(), zip, parsed, options, {
        actorId: actor.id,
        maxFileBytes: importMaxBytes(),
        hashPassword: password.hash,
      });
      return result;
    } finally {
      zip.close();
      await removeImport(params.importId);
    }
  },
  { admin: true },
);

/** Cancels an import: the uploaded archive is deleted. */
export const DELETE = route<Params>(
  async (_req, { params }) => {
    await removeImport(params.importId);
  },
  { admin: true },
);
