import { folderCreateSchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { createFolder, listFolders } from "@/server/folders";
import { parseBody, prisma, route } from "@/server/http";

export const GET = route(() => listFolders(prisma));

export const POST = route(async (req) => {
  const folder = await createFolder(prisma, await parseBody(req, folderCreateSchema));
  return NextResponse.json(folder, { status: 201 });
});
