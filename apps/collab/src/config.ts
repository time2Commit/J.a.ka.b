import "dotenv/config";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const config = {
  port: Number(process.env.COLLAB_PORT ?? 1234),
  /** Where the collab server reaches the web app to validate sessions (internal address). */
  webUrl: process.env.WEB_INTERNAL_URL ?? appUrl,
  /** Browsers must connect from this origin (guards against cross-site WebSocket hijacking). */
  allowedOrigin: new URL(appUrl).origin,
  /** Delay before changes are written to Postgres, and the longest a change may wait. */
  storeDebounceMs: 2000,
  storeMaxDebounceMs: 10_000,
  /** Largest WebSocket message accepted. A note is text; this only stops abuse. */
  maxPayloadBytes: Number(process.env.COLLAB_MAX_PAYLOAD_MB ?? 32) * 1024 * 1024,
};
