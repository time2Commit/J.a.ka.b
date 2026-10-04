import { cardUpdateSchema } from "@jakab/shared";
import { deleteCard, getCard, updateCard } from "@/server/cards";
import { parseBody, prisma, route } from "@/server/http";

type Params = { id: string };

export const GET = route<Params>((_req, { params }) => getCard(prisma, params.id));

export const PATCH = route<Params>(async (req, { actor, params }) =>
  updateCard(prisma, params.id, await parseBody(req, cardUpdateSchema), actor.id),
);

export const DELETE = route<Params>(async (_req, { actor, params }) =>
  deleteCard(prisma, params.id, actor.id),
);
