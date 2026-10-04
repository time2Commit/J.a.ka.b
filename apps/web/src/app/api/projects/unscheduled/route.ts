import { prisma, route } from "@/server/http";
import { listUnscheduled } from "@/server/suggest";

export const GET = route(() => listUnscheduled(prisma));
