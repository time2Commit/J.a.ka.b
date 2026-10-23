import { listLabels, listStatuses } from "@/server/catalog";
import { prisma, route } from "@/server/http";
import { listUsers } from "@/server/users";
import { getWorkspace } from "@/server/workspace";

/** Everything the board needs besides cards: workspace settings, statuses, labels, members. */
export const GET = route(async (_req, { actor }) => {
  const [workspace, statuses, labels, users, me] = await Promise.all([
    getWorkspace(prisma),
    listStatuses(prisma),
    listLabels(prisma),
    listUsers(prisma),
    prisma.user.findUnique({
      where: { id: actor.id },
      select: { calendarView: true, projectSort: true },
    }),
  ]);
  return {
    workspace,
    statuses,
    labels,
    users,
    preferences: { calendarView: me?.calendarView ?? null, projectSort: me?.projectSort ?? null },
  };
});
