import type { PrismaClient } from "@jakab/db";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";
import { parseNoteDocumentName } from "@jakab/editor";
import { authenticate, fetchSessionFromWeb, type AuthContext } from "./auth";
import { config } from "./config";
import { loadNote, storeNote } from "./persistence";

export function createCollabServer(options: {
  db: PrismaClient;
  port?: number;
  webUrl?: string;
  allowedOrigin?: string;
  storeDebounceMs?: number;
}) {
  const { db } = options;
  const getSession = fetchSessionFromWeb(options.webUrl ?? config.webUrl);

  return new Server<AuthContext>({
    port: options.port ?? config.port,
    name: "jakab-collab",
    quiet: true,
    debounce: options.storeDebounceMs ?? config.storeDebounceMs,
    maxDebounce: config.storeMaxDebounceMs,

    async onAuthenticate({ documentName, requestHeaders }) {
      // The returned object becomes the connection context.
      return authenticate({
        documentName,
        cookie: requestHeaders.get("cookie"),
        origin: requestHeaders.get("origin"),
        allowedOrigin: options.allowedOrigin ?? config.allowedOrigin,
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

    async onStoreDocument({ document, documentName, lastContext }) {
      const projectId = parseNoteDocumentName(documentName);
      if (projectId) await storeNote(db, projectId, document, lastContext?.user?.id ?? null);
    },
  });
}
