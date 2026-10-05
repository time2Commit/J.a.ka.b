import type { PrismaClient } from "@jakab/db";
import { Server, type Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";
import { parseNoteDocumentName } from "@jakab/editor";
import { authenticate, fetchSessionFromWeb, type AuthContext } from "./auth";
import { config } from "./config";
import { handleInternalRequest } from "./internal-api";
import { loadNote, storeNote } from "./persistence";
import { maybeAutoVersion } from "./versions";

export function createCollabServer(options: {
  db: PrismaClient;
  port?: number;
  webUrl?: string;
  allowedOrigin?: string;
  storeDebounceMs?: number;
  maxPayloadBytes?: number;
}) {
  const { db } = options;
  const getSession = fetchSessionFromWeb(options.webUrl ?? config.webUrl);
  const allowedOrigin = options.allowedOrigin ?? config.allowedOrigin;

  // Users who edited a live note since its last version (becomes the version's author list).
  const pendingAuthors = new Map<string, Set<string>>();
  const takeAuthors = (documentName: string) => {
    const authors = [...(pendingAuthors.get(documentName) ?? [])];
    pendingAuthors.delete(documentName);
    return authors;
  };
  const snapshot = async (
    documentName: string,
    document: Y.Doc,
    userId: string | null,
    force: boolean,
  ) => {
    const projectId = parseNoteDocumentName(documentName);
    if (!projectId) return false;
    // Take the authors before awaiting: whoever edits while the version is being written
    // must count for the next one, not be wiped when this one is done.
    const authors = takeAuthors(documentName);
    let created = false;
    try {
      created = await maybeAutoVersion(db, { projectId, doc: document, authors, userId, force });
    } finally {
      if (!created) {
        const pending = pendingAuthors.get(documentName) ?? new Set<string>();
        for (const author of authors) pending.add(author);
        if (pending.size > 0) pendingAuthors.set(documentName, pending);
      }
    }
    return created;
  };

  const server = new Server<AuthContext>({
    port: options.port ?? config.port,
    name: "jakab-collab",
    quiet: true,
    debounce: options.storeDebounceMs ?? config.storeDebounceMs,
    maxDebounce: config.storeMaxDebounceMs,
    // Oversized messages close the connection (code 1009) before they are parsed.
    websocketOptions: { maxPayload: options.maxPayloadBytes ?? config.maxPayloadBytes },

    async onAuthenticate({ documentName, requestHeaders }) {
      // The returned object becomes the connection context.
      return authenticate({
        documentName,
        cookie: requestHeaders.get("cookie"),
        origin: requestHeaders.get("origin"),
        allowedOrigin,
        db,
        getSession,
      });
    },

    async onLoadDocument({ document, documentName }) {
      const projectId = parseNoteDocumentName(documentName);
      const state = projectId ? await loadNote(db, projectId) : null;
      if (state) Y.applyUpdate(document, state);
      return document;
    },

    async onChange({ documentName, context }) {
      const userId = context?.user?.id;
      if (!userId) return;
      const authors = pendingAuthors.get(documentName) ?? new Set<string>();
      authors.add(userId);
      pendingAuthors.set(documentName, authors);
    },

    async onStoreDocument({ document, documentName, lastContext }) {
      const projectId = parseNoteDocumentName(documentName);
      if (!projectId) return;
      const userId = lastContext?.user?.id ?? null;
      await storeNote(db, projectId, document, userId);
      await snapshot(documentName, document, userId, false);
    },

    // The last editor left: keep the state they ended with, even if the interval has not passed.
    async beforeUnloadDocument({ document, documentName }) {
      await snapshot(documentName, document, null, true);
      pendingAuthors.delete(documentName);
    },

    async onRequest({ request, response, instance }) {
      const handled = await handleInternalRequest(request, response, {
        db,
        hocuspocus: instance as Hocuspocus<AuthContext>,
        getSession,
        allowedOrigin,
        takeAuthors,
      });
      // Throwing nothing stops Hocuspocus from sending its default reply.
      if (handled) throw undefined;
    },
  });
  return server;
}
