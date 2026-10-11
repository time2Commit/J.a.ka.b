import { prisma, route } from "@/server/http";
import { searchEverything } from "@/server/search";

/** `GET /api/search?q=`: projects by name, then projects whose note contains the words. */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return searchEverything(prisma, q);
});
