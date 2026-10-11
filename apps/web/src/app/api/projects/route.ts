import { projectCreateSchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { parseBody, prisma, route } from "@/server/http";
import { createProject } from "@/server/projects";
import { listProjects } from "@/server/projects-list";

export const GET = route(() => listProjects(prisma));

/** A project with its note and no card: from a template, in a folder, or both. */
export const POST = route(async (req, { actor }) => {
  const project = await createProject(prisma, await parseBody(req, projectCreateSchema), actor.id);
  return NextResponse.json(project, { status: 201 });
});
