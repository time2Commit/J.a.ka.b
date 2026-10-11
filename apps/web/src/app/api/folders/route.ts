import { folderCreateSchema, folderKindQuerySchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { createFolder, listFolders } from "@/server/folders";
import { parseBody, prisma, route } from "@/server/http";

/** `GET /api/folders?kind=project|template`: the folders of one tree. */
export const GET = route((req) => {
  const { kind } = folderKindQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return listFolders(prisma, kind);
});

export const POST = route(async (req) => {
  const folder = await createFolder(prisma, await parseBody(req, folderCreateSchema));
  return NextResponse.json(folder, { status: 201 });
});
