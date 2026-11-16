import { userUpdateSchema } from "@jakab/shared";
import { disconnectFromNotes } from "@/server/collab";
import { parseBody, prisma, route } from "@/server/http";
import { updateUser } from "@/server/users";

/** An administrator changes somebody's name or role, or deactivates / reactivates the account. */
export const PATCH = route<{ id: string }>(
  async (req, { actor, params }) => {
    const input = await parseBody(req, userUpdateSchema);
    const { user, sessionsClosed } = await updateUser(prisma, actor.id, params.id, input);
    // `notesDisconnected: false` lets the page say that open notes may stay visible for a while.
    const notesDisconnected = sessionsClosed ? await disconnectFromNotes(req, params.id) : true;
    return { ...user, notesDisconnected };
  },
  { admin: true },
);
