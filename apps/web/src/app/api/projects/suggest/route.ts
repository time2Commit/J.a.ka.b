import { prisma, route } from "@/server/http";
import { suggestProjects } from "@/server/suggest";

export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return suggestProjects(prisma, q.slice(0, 120));
});
