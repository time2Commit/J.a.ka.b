import { templateInputSchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { parseBody, prisma, route } from "@/server/http";
import { createTemplate, listTemplates } from "@/server/templates";

export const GET = route(() => listTemplates(prisma));

export const POST = route(async (req, { actor }) => {
  const input = await parseBody(req, templateInputSchema);
  return NextResponse.json(await createTemplate(prisma, input, actor.id), { status: 201 });
});
