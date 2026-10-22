import { timingSafeEqual } from "node:crypto";

/** Header the register form sends the setup token in. */
export const BOOTSTRAP_TOKEN_HEADER = "x-bootstrap-token";

/** The setup token the operator configured (`BOOTSTRAP_TOKEN`), or null when there is none. */
export const configuredBootstrapToken = (env: Record<string, string | undefined> = process.env) =>
  env.BOOTSTRAP_TOKEN?.trim() || null;

/**
 * Whether the first account may be created. Without a configured token anybody may (the
 * documented first-run behaviour); with one, the request must carry the same value.
 */
export function bootstrapTokenAccepted(configured: string | null, provided: string | null) {
  if (configured === null) return true;
  if (provided === null) return false;
  const a = Buffer.from(configured);
  const b = Buffer.from(provided.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}
