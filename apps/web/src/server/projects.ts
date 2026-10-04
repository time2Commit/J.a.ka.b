import type { Prisma, PrismaClient } from "@jakab/db";
import type { ProjectUpdateInput } from "@jakab/shared";
import { notFound } from "./errors";
import { notifyBoardChanged } from "./notify";

const projectInclude = { labels: true, members: true } as const;

export async function getProject(db: PrismaClient, id: string) {
  const project = await db.project.findUnique({ where: { id }, include: projectInclude });
  if (!project) throw notFound("Project");
  return toProjectDto(project);
}

function toProjectDto(p: Prisma.ProjectGetPayload<{ include: typeof projectInclude }>) {
  return {
    id: p.id,
    name: p.name,
    statusId: p.statusId,
    progress: p.progress,
    color: p.color,
    labelIds: p.labels.map((l) => l.labelId),
    memberIds: p.members.map((m) => m.userId),
  };
}
export async function updateProject(
  db: PrismaClient,
  id: string,
  input: ProjectUpdateInput,
  userId: string,
) {
  return db.$transaction(async (tx) => {
    if (!(await tx.project.findUnique({ where: { id }, select: { id: true } }))) {
      throw notFound("Project");
    }
    const { labelIds, memberIds, ...fields } = input;
    const project = await tx.project.update({
      where: { id },
      data: {
        ...fields,
        ...(labelIds && {
          labels: { deleteMany: {}, create: labelIds.map((labelId) => ({ labelId })) },
        }),
        ...(memberIds && {
          members: { deleteMany: {}, create: memberIds.map((uid) => ({ userId: uid })) },
        }),
      },
      include: projectInclude,
    });
    await tx.activity.create({
      data: {
        projectId: id,
        userId,
        type: "project.updated",
        payload: { fields: Object.keys(input) },
      },
    });
    await notifyBoardChanged(tx, "project", id);
    return toProjectDto(project);
  });
}
