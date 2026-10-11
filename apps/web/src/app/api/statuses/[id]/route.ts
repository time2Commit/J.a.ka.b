import { statusDeleteSchema, statusUpdateSchema } from "@jakab/shared";
import { deleteStatus, updateStatus } from "@/server/catalog";
import { parseBody, prisma, route } from "@/server/http";

type Params = { id: string };

export const PATCH = route<Params>(
  async (req, { params }) =>
    updateStatus(prisma, params.id, await parseBody(req, statusUpdateSchema)),
  { admin: true },
);

export const DELETE = route<Params>(
  async (req, { params }) => {
    const { replaceWith } = await parseBody(req, statusDeleteSchema);
    return deleteStatus(prisma, params.id, replaceWith);
  },
  { admin: true },
);
