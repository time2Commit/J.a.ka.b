import { calendarDeleteSchema, calendarUpdateSchema } from "@jakab/shared";
import { deleteCalendar, updateCalendar } from "@/server/calendars";
import { parseBody, prisma, route } from "@/server/http";

type Params = { id: string };

export const PATCH = route<Params>(
  async (req, { params }) =>
    updateCalendar(prisma, params.id, await parseBody(req, calendarUpdateSchema)),
  { admin: true },
);

export const DELETE = route<Params>(
  async (req, { params }) => {
    const { replaceWith } = await parseBody(req, calendarDeleteSchema);
    return deleteCalendar(prisma, params.id, replaceWith);
  },
  { admin: true },
);
