import type { PrismaClient } from "@jakab/db";
import { noteDocumentName } from "@jakab/editor";
import type { Hocuspocus } from "@hocuspocus/server";
import type { IncomingMessage, ServerResponse } from "node:http";
import { versionCreateSchema } from "@jakab/shared";
import { ZodError } from "zod";
import { authenticate, type AuthContext, type SessionFetcher } from "./auth";
import { createVersion, replaceNoteContent } from "./versions";

const ROUTE = /^\/internal\/projects\/([^/]+)\/versions(?:\/([^/]+)\/restore)?$/;

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 10_000) throw new RequestError(413, "Body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "Invalid JSON");
  }
}

/**
 * Write operations that need the live document: saving a manual version and restoring one. The
 * web app forwards the user's session cookie, so access is checked exactly like a WebSocket
 * connection. Returns false when the request is not one of these routes.
 */
export async function handleInternalRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps: {
    db: PrismaClient;
    hocuspocus: Hocuspocus<AuthContext>;
    getSession: SessionFetcher;
    allowedOrigin: string;
    /** Authors seen on a live document since its last version (shared with the change hook). */
    takeAuthors: (documentName: string) => string[];
  },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://internal");
  const match = ROUTE.exec(url.pathname);
  if (!match) return false;

  try {
    if (req.method !== "POST") throw new RequestError(405, "Method not allowed");
    const [, projectId, versionId] = match as unknown as [string, string, string | undefined];
    const documentName = noteDocumentName(projectId);
    const auth = await authenticate({
      documentName,
      cookie: req.headers.cookie ?? null,
      origin: null,
      allowedOrigin: deps.allowedOrigin,
      db: deps.db,
      getSession: deps.getSession,
    }).catch(() => {
      throw new RequestError(401, "Unauthorized");
    });
    const body = await readJson(req);

    const connection = await deps.hocuspocus.openDirectConnection(documentName, auth);
    try {
      const doc = connection.document;
      if (!doc) throw new RequestError(500, "Document unavailable");

      if (!versionId) {
        const { label } = versionCreateSchema.parse(body);
        const created = await createVersion(deps.db, {
          projectId,
          doc,
          reason: "manual",
          authors: deps.takeAuthors(documentName),
          userId: auth.user.id,
          label,
        });
        send(res, 201, created);
        return true;
      }

      const version = await deps.db.noteVersion.findFirst({
        where: { id: versionId, projectId },
        select: { json: true },
      });
      if (!version) throw new RequestError(404, "Version not found");

      // Non-destructive: the current content is kept as a version before it is replaced.
      const safety = await createVersion(deps.db, {
        projectId,
        doc,
        reason: "pre_restore",
        authors: deps.takeAuthors(documentName),
        userId: auth.user.id,
      });
      await connection.transact((live) => {
        replaceNoteContent(live, version.json as Parameters<typeof replaceNoteContent>[1]);
      });
      await deps.db.activity.create({
        data: {
          projectId,
          userId: auth.user.id,
          type: "version.restored",
          payload: { versionId, preRestoreVersionId: safety.id },
        },
      });
      send(res, 200, { preRestoreVersionId: safety.id });
    } finally {
      await connection.disconnect();
    }
  } catch (error) {
    if (error instanceof RequestError) send(res, error.status, { error: error.message });
    else if (error instanceof ZodError) send(res, 400, { error: "Invalid input" });
    else {
      console.error(error);
      send(res, 500, { error: "Internal error" });
    }
  }
  return true;
}
