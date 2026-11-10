import { calendarReorderSchema } from "@jakab/shared";
import { reorderCalendars } from "@/server/calendars";
import { parseBody, prisma, route } from "@/server/http";

export const POST = route(
  async (req) => reorderCalendars(prisma, (await parseBody(req, calendarReorderSchema)).ids),
  { admin: true },
);
