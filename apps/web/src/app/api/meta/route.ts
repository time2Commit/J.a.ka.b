import { listLabels, listStatuses } from "@/server/catalog";
import { prisma, route } from "@/server/http";
import { listUsers } from "@/server/users";

/** Everything the board needs besides cards: workspace settings, statuses, labels, members. */
export const GET = route(async () => {
  const [workspace, statuses, labels, users] = await Promise.all([
    prisma.workspace.upsert({ where: { id: "default" }, update: {}, create: {} }),
    listStatuses(prisma),
    listLabels(prisma),
    listUsers(prisma),
  ]);
  return { workspace, statuses, labels, users };
});
