import type { PrismaClient } from "@jakab/db";
import { parseNoteDocumentName } from "@jakab/editor";

export interface CollabUser {
  id: string;
  name: string;
  color: string;
}

export interface AuthContext {
  user: CollabUser;
  projectId: string;
}

/** `clientIp` is the caller's address as the reverse proxy reported it (`x-forwarded-for`). */
export type SessionFetcher = (
  cookie: string,
  clientIp?: string | null,
) => Promise<{
  user?: { id: string; name: string; avatarColor?: string };
} | null>;

/**
 * Validates the browser session by asking the web app (single source of truth for auth). The
 * caller's address is passed along: without it the web app cannot tell callers apart and counts
 * every check in one shared rate-limit bucket, which anybody could then exhaust.
 */
export const fetchSessionFromWeb =
  (webUrl: string): SessionFetcher =>
  async (cookie, clientIp) => {
    const res = await fetch(`${webUrl}/api/auth/get-session`, {
      headers: { cookie, ...(clientIp ? { "x-forwarded-for": clientIp } : {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as Awaited<ReturnType<SessionFetcher>>;
  };

export async function authenticate(params: {
  documentName: string;
  cookie: string | null;
  origin: string | null;
  /** `x-forwarded-for` of the request, as set by the reverse proxy. */
  clientIp?: string | null;
  allowedOrigin: string;
  db: PrismaClient;
  getSession: SessionFetcher;
}): Promise<AuthContext> {
  const { documentName, cookie, origin, clientIp, allowedOrigin, db, getSession } = params;

  if (origin !== null && origin !== allowedOrigin) throw new Error("Origin not allowed");

  const projectId = parseNoteDocumentName(documentName);
  if (!projectId) throw new Error("Unknown document");
  if (!cookie) throw new Error("Not authenticated");

  const session = await getSession(cookie, clientIp);
  if (!session?.user) throw new Error("Not authenticated");

  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found");

  const { id, name, avatarColor } = session.user;
  return { projectId, user: { id, name, color: avatarColor ?? "#6366f1" } };
}
