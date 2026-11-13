import { externalEventRangeSchema } from "@jakab/shared";
import { prisma, route } from "@/server/http";
import { listExternalEvents } from "@/server/sources";

/** The read-only events of the source calendars that touch the visible range. */
export const GET = route(async (req) => {
  const { from, to } = externalEventRangeSchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  return listExternalEvents(prisma, from, to);
});
