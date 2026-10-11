import { projectUpdateSchema } from "@jakab/shared";
import { parseBody, prisma, route } from "@/server/http";
import { deleteProject, getProject, updateProject } from "@/server/projects";
import { getStorage } from "@/server/storage";

type Params = { id: string };

export const GET = route<Params>((_req, { params }) => getProject(prisma, params.id));

export const PATCH = route<Params>(async (req, { actor, params }) =>
  updateProject(prisma, params.id, await parseBody(req, projectUpdateSchema), actor.id),
);

export const DELETE = route<Params>((_req, { actor, params }) =>
  deleteProject(prisma, getStorage(), params.id, actor),
);
