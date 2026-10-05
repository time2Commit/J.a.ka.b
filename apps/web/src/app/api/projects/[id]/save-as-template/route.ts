import { saveAsTemplateSchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { parseBody, prisma, route } from "@/server/http";
import { saveProjectAsTemplate } from "@/server/templates";

type Params = { id: string };

/** Settings and note content of the project (without files) become a reusable template. */
export const POST = route<Params>(async (req, { actor, params }) => {
  const { name } = await parseBody(req, saveAsTemplateSchema);
  return NextResponse.json(await saveProjectAsTemplate(prisma, params.id, name, actor.id), {
    status: 201,
  });
});
