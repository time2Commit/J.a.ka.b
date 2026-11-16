import { passwordResetSchema } from "@jakab/shared";
import { auth } from "@/lib/auth";
import { disconnectFromNotes } from "@/server/collab";
import { parseBody, prisma, route } from "@/server/http";
import { LIMITS } from "@/server/rate-limit";
import { resetUserPassword } from "@/server/users";

/**
 * An administrator sets a temporary password for somebody: they are signed out everywhere and
 * must choose a new one at the next sign-in. The password is never logged nor returned.
 */
export const POST = route<{ id: string }>(
  async (req, { actor, params }) => {
    const { password } = await parseBody(req, passwordResetSchema);
    const { password: hasher } = await auth.$context;
    await resetUserPassword(prisma, actor.id, params.id, await hasher.hash(password));
    return { notesDisconnected: await disconnectFromNotes(req, params.id) };
  },
  { admin: true, rateLimit: LIMITS.passwordReset },
);
