import { sourceVerifySchema } from "@jakab/shared";
import { parseBody, prisma, route } from "@/server/http";
import { LIMITS } from "@/server/rate-limit";
import { verifySource } from "@/server/sources";

/** Tries credentials with one call to the provider and returns the options to offer. Saves nothing. */
export const POST = route(
  async (req) => verifySource(prisma, await parseBody(req, sourceVerifySchema)),
  { admin: true, rateLimit: LIMITS.sourceVerify },
);
