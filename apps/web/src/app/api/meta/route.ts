import { listCalendars } from "@/server/calendars";
import { listLabels, listStatuses } from "@/server/catalog";
import { prisma, route } from "@/server/http";
import { listUsers } from "@/server/users";
import { getWorkspace } from "@/server/workspace";

/** Everything the board needs besides cards: workspace settings, statuses, calendars, labels, members. */
export const GET = route(async (_req, { actor }) => {
  const [workspace, statuses, calendars, labels, users, me] = await Promise.all([
    getWorkspace(prisma),
    listStatuses(prisma),
    listCalendars(prisma),
    listLabels(prisma),
    listUsers(prisma),
    prisma.user.findUnique({
      where: { id: actor.id },
      select: { calendarView: true, projectSort: true, hiddenCalendarIds: true },
    }),
  ]);
  return {
    workspace,
    statuses,
    calendars,
    labels,
    users,
    preferences: {
      calendarView: me?.calendarView ?? null,
      projectSort: me?.projectSort ?? null,
      hiddenCalendarIds: me?.hiddenCalendarIds ?? [],
    },
  };
});
