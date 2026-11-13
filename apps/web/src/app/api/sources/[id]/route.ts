import { sourceUpdateSchema } from "@jakab/shared";
import { TooManyRequests } from "@/server/errors";
import { parseBody, prisma, route } from "@/server/http";
import { limiterFor, LIMITS } from "@/server/rate-limit";
import { disconnectSource, updateSource } from "@/server/sources";

type Params = { id: string };

export const PATCH = route<Params>(
  async (req, { actor, params }) => {
    const input = await parseBody(req, sourceUpdateSchema);
    // Only a change that makes the source call the provider (a new key, other options, resuming)
    // spends the allowance; pausing does not.
    if (input.credentials !== undefined || input.config !== undefined || input.enabled === true) {
      const { allowed, retryAfterMs } = limiterFor(LIMITS.sourceSync).hit(actor.id);
      if (!allowed) throw new TooManyRequests(Math.max(1, Math.ceil(retryAfterMs / 1000)));
    }
    return updateSource(prisma, params.id, input);
  },
  { admin: true },
);

export const DELETE = route<Params>(
  async (_req, { params }) => disconnectSource(prisma, params.id),
  { admin: true },
);
