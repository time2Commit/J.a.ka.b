import { prisma } from "@jakab/db";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSession } from "../lib/session";
import { HttpError, TooManyRequests } from "./errors";
import { limiterFor, type RateLimitRule } from "./rate-limit";

interface Actor {
  id: string;
  role: "admin" | "member";
}

type Handler<P> = (req: Request, ctx: { actor: Actor; params: P }) => Promise<Response | unknown>;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Requests that change something must come from this site. Browsers always send `Origin` on such
 * requests, so a page on another origin that makes the browser call the API with the person's
 * cookie is refused, even if the cookie were ever sent along (the `SameSite=Lax` cookie already
 * keeps it back from other sites). Calls without `Origin` (scripts, tests) are not browser
 * requests and are left to the session check.
 */
function assertSameOrigin(req: Request, appUrl = process.env.APP_URL) {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (origin === null) return;
  let expected: string;
  try {
    expected = new URL(appUrl ?? "http://localhost:3000").origin;
  } catch {
    expected = "http://localhost:3000";
  }
  if (origin !== expected) throw new HttpError(403, "Cross-origin request refused");
}

/**
 * Wraps a route handler: authenticates, optionally requires admin and rate-limits per user, maps
 * errors to JSON responses.
 */
export function route<P = Record<string, never>>(
  handler: Handler<P>,
  options: { admin?: boolean; rateLimit?: RateLimitRule } = {},
) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      assertSameOrigin(req);
      const session = await getSession();
      if (!session) throw new HttpError(401, "Unauthorized");
      const actor: Actor = {
        id: session.user.id,
        role: (session.user as { role?: string }).role === "admin" ? "admin" : "member",
      };
      if (options.admin && actor.role !== "admin") throw new HttpError(403, "Forbidden");
      if (options.rateLimit) {
        const { allowed, retryAfterMs } = limiterFor(options.rateLimit).hit(actor.id);
        if (!allowed) throw new TooManyRequests(Math.max(1, Math.ceil(retryAfterMs / 1000)));
      }
      const result = await handler(req, { actor, params: await ctx.params });
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json(
          { error: error.message, ...(error.code && { code: error.code }) },
          {
            status: error.status,
            ...(error instanceof TooManyRequests && {
              headers: { "Retry-After": String(error.retryAfterSeconds) },
            }),
          },
        );
      }
      if (error instanceof ZodError) {
        return NextResponse.json({ error: "Invalid input", issues: error.issues }, { status: 400 });
      }
      if (isUniqueViolation(error)) {
        return NextResponse.json({ error: "Already exists" }, { status: 409 });
      }
      console.error(error);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002"
  );
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  return schema.parse(await req.json().catch(() => ({})));
}

export { prisma };
