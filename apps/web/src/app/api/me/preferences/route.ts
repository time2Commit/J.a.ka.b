import { userPreferencesSchema } from "@jakab/shared";
import { parseBody, prisma, route } from "@/server/http";

/** The signed-in person's own settings: the default calendar view and the project tree order. */
export const PATCH = route(async (req, { actor }) => {
  const { calendarView, projectSort } = await parseBody(req, userPreferencesSchema);
  const user = await prisma.user.update({
    where: { id: actor.id },
    data: {
      ...(calendarView !== undefined && { calendarView }),
      ...(projectSort !== undefined && { projectSort }),
    },
    select: { calendarView: true, projectSort: true },
  });
  return user;
});
