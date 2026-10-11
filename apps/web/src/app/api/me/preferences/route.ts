import { userPreferencesSchema } from "@jakab/shared";
import { parseBody, prisma, route } from "@/server/http";

/** The signed-in person's own settings (today: the calendar view they open by default). */
export const PATCH = route(async (req, { actor }) => {
  const { calendarView } = await parseBody(req, userPreferencesSchema);
  await prisma.user.update({ where: { id: actor.id }, data: { calendarView } });
  return { calendarView };
});
