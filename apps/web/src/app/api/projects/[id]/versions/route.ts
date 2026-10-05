import { versionCreateSchema } from "@jakab/shared";
import { collabPost } from "@/server/collab";
import { parseBody, prisma, route } from "@/server/http";
import { listVersions } from "@/server/versions";

type Params = { id: string };

export const GET = route<Params>((_req, { params }) => listVersions(prisma, params.id));

/** Saves the live note as a manual version (taken by the collab server, which holds the live state). */
export const POST = route<Params>(async (req, { params }) => {
  const body = await parseBody(req, versionCreateSchema);
  return collabPost(`/internal/projects/${params.id}/versions`, req.headers.get("cookie"), body);
});
