const PLACEHOLDERS = new Set([
  "change-me-to-a-long-random-string",
  "dev-only-insecure-secret-change-me",
]);
const DEV_SECRET = "dev-only-insecure-secret-change-me";

/**
 * The secret that signs sessions. Production needs a real one (at least 32 characters, not a
 * placeholder from the docs). `next build` loads the code without any secret, so it gets a
 * throwaway value there; it is never used to serve a request.
 */
export function resolveAuthSecret(env: Record<string, string | undefined>): string {
  const secret = env.AUTH_SECRET;
  if (env.NEXT_PHASE === "phase-production-build") return secret || DEV_SECRET;
  if (env.NODE_ENV !== "production") return secret || DEV_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required in production");
  if (secret.length < 32 || PLACEHOLDERS.has(secret)) {
    throw new Error(
      "AUTH_SECRET must be a random string of at least 32 characters (e.g. `openssl rand -base64 32`)",
    );
  }
  return secret;
}
