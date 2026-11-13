import { prisma, route } from "@/server/http";
import { LIMITS } from "@/server/rate-limit";
import { syncSourceNow } from "@/server/sources";

/** "Update now": one run of the source, whatever its schedule says. */
export const POST = route<{ id: string }>(
  async (_req, { params }) => syncSourceNow(prisma, params.id),
  {
    admin: true,
    rateLimit: LIMITS.sourceSync,
  },
);
