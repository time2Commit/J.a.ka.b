import { sourceUpdateSchema } from "@jakab/shared";
import { parseBody, prisma, route } from "@/server/http";
import { LIMITS } from "@/server/rate-limit";
import { disconnectSource, updateSource } from "@/server/sources";

type Params = { id: string };

// A change that makes the source fetch again (a new key, other options) calls the provider.
export const PATCH = route<Params>(
  async (req, { params }) =>
    updateSource(prisma, params.id, await parseBody(req, sourceUpdateSchema)),
  { admin: true, rateLimit: LIMITS.sourceSync },
);

export const DELETE = route<Params>(
  async (_req, { params }) => disconnectSource(prisma, params.id),
  {
    admin: true,
  },
);
