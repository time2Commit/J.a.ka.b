import { calendarInputSchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { createCalendar } from "@/server/calendars";
import { parseBody, prisma, route } from "@/server/http";

export const POST = route(
  async (req) =>
    NextResponse.json(await createCalendar(prisma, await parseBody(req, calendarInputSchema)), {
      status: 201,
    }),
  { admin: true },
);
