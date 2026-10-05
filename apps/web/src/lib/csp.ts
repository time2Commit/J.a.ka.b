/** Origin (ws:/wss:) the browser connects to for real-time notes, from `COLLAB_PUBLIC_URL`. */
export function collabOrigin(env: Record<string, string | undefined>): string {
  try {
    return new URL(env.COLLAB_PUBLIC_URL ?? "ws://localhost:1234").origin;
  } catch {
    return "ws://localhost:1234";
  }
}

/**
 * Content-Security-Policy for pages. Scripts need the per-request nonce (`strict-dynamic` lets
 * the framework's own scripts load their chunks); styles allow inline because the UI libraries
 * set inline styles. Uploaded files are served from this origin only, never executed.
 */
export function buildCsp(options: {
  nonce: string;
  dev?: boolean;
  env: Record<string, string | undefined>;
}): string {
  const { nonce, dev = false, env } = options;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // React's dev tooling needs eval; production does not.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", collabOrigin(env)],
    // PDF previews are <object> elements pointing at our own attachment route.
    "object-src": ["'self'"],
    "frame-src": ["'self'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/** True when the public URL is HTTPS, which turns on HSTS. */
export const isHttps = (appUrl: string | undefined) => (appUrl ?? "").startsWith("https://");
