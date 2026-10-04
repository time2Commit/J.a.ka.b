import { prisma, route } from "@/server/http";
import { listProjects } from "@/server/projects-list";

export const GET = route(() => listProjects(prisma));
