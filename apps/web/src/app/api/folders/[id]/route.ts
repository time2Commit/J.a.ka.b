import { folderUpdateSchema } from "@jakab/shared";
import { deleteFolder, updateFolder } from "@/server/folders";
import { parseBody, prisma, route } from "@/server/http";

type Params = { id: string };

export const PATCH = route<Params>(async (req, { params }) =>
  updateFolder(prisma, params.id, await parseBody(req, folderUpdateSchema)),
);

export const DELETE = route<Params>((_req, { params }) => deleteFolder(prisma, params.id));
