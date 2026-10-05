import { templateUpdateSchema } from "@jakab/shared";
import { parseBody, prisma, route } from "@/server/http";
import { deleteTemplate, getTemplate, updateTemplate } from "@/server/templates";

type Params = { id: string };

export const GET = route<Params>((_req, { params }) => getTemplate(prisma, params.id));

export const PATCH = route<Params>(async (req, { params }) =>
  updateTemplate(prisma, params.id, await parseBody(req, templateUpdateSchema)),
);

export const DELETE = route<Params>(async (_req, { params }) => {
  await deleteTemplate(prisma, params.id);
});
