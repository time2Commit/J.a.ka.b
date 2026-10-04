import { prisma } from "@jakab/db";
import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSession } from "../lib/session";
import { HttpError } from "./errors";

export interface Actor {
  id: string;
  role: "admin" | "member";
}

type Handler<P> = (req: Request, ctx: { actor: Actor; params: P }) => Promise<Response | unknown>;

/** Wraps a route handler: authenticates, optionally requires admin, maps errors to JSON responses. */
export function route<P = Record<string, never>>(
  handler: Handler<P>,
  options: { admin?: boolean } = {},
) {
  return async (req: Request, ctx: { params: Promise<P> }) => {
    try {
      const session = await getSession();
      if (!session) throw new HttpError(401, "Unauthorized");
      const actor: Actor = {
        id: session.user.id,
        role: (session.user as { role?: string }).role === "admin" ? "admin" : "member",
      };
      if (options.admin && actor.role !== "admin") throw new HttpError(403, "Forbidden");
      const result = await handler(req, { actor, params: await ctx.params });
      return result instanceof Response ? result : NextResponse.json(result ?? { ok: true });
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
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
