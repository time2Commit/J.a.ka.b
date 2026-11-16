import { accountUpdateSchema } from "@jakab/shared";
import { parseBody, prisma, route } from "@/server/http";
import { updateOwnAccount } from "@/server/users";

/** The signed-in person changes their own account. The password goes through the auth routes. */
export const PATCH = route(async (req, { actor }) =>
  updateOwnAccount(prisma, actor.id, await parseBody(req, accountUpdateSchema)),
);
