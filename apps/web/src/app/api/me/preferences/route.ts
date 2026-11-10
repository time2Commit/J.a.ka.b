import { userPreferencesSchema } from "@jakab/shared";
import { parseBody, prisma, route } from "@/server/http";

/** The signed-in person's own settings: the default calendar view, the project tree order and the calendars they hide. */
export const PATCH = route(async (req, { actor }) => {
  const { calendarView, projectSort, hiddenCalendarIds } = await parseBody(
    req,
    userPreferencesSchema,
  );
  const user = await prisma.user.update({
    where: { id: actor.id },
    data: {
      ...(calendarView !== undefined && { calendarView }),
      ...(projectSort !== undefined && { projectSort }),
      ...(hiddenCalendarIds !== undefined && {
        hiddenCalendarIds: [...new Set(hiddenCalendarIds)],
      }),
    },
    select: { calendarView: true, projectSort: true, hiddenCalendarIds: true },
  });
  return user;
});
