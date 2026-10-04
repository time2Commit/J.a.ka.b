import { workspaceUpdateSchema } from "@jakab/shared";
import { parseBody, prisma, route } from "@/server/http";
import { notifyBoardChanged } from "@/server/notify";

export const PATCH = route(
  async (req) => {
    const data = await parseBody(req, workspaceUpdateSchema);
    const workspace = await prisma.workspace.upsert({
      where: { id: "default" },
      update: data,
      create: data,
    });
    await notifyBoardChanged(prisma, "workspace");
    return workspace;
  },
  { admin: true },
);
