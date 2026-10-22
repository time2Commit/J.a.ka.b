import { HttpError } from "./errors";

const baseUrl = () =>
  process.env.COLLAB_INTERNAL_URL ?? `http://localhost:${process.env.COLLAB_PORT ?? 1234}`;

/**
 * Asks the collab server to act on a live note. The user's cookie is forwarded, so the collab
 * server authorizes the call exactly as it does a WebSocket connection; the caller's address
 * goes along so that session checks are rate-limited per person, not all together.
 */
export async function collabPost<T>(path: string, req: Request, body: unknown = {}) {
  const cookie = req.headers.get("cookie");
  const clientIp = req.headers.get("x-forwarded-for");
  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(clientIp ? { "x-forwarded-for": clientIp } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(503, "Collaboration server unavailable");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new HttpError(res.status === 401 ? 502 : res.status, data.error ?? "Failed");
  return data;
}
