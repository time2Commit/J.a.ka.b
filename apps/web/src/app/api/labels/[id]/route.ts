import { labelUpdateSchema } from "@jakab/shared";
import { deleteLabel, updateLabel } from "@/server/catalog";
import { parseBody, prisma, route } from "@/server/http";

type Params = { id: string };

export const PATCH = route<Params>(
  async (req, { params }) =>
    updateLabel(prisma, params.id, await parseBody(req, labelUpdateSchema)),
  { admin: true },
);

export const DELETE = route<Params>((_req, { params }) => deleteLabel(prisma, params.id), {
  admin: true,
});
