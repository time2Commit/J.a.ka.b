import { prisma, route } from "@/server/http";
import { getVersion } from "@/server/versions";

type Params = { id: string; versionId: string };

export const GET = route<Params>((_req, { params }) =>
  getVersion(prisma, params.id, params.versionId),
);
