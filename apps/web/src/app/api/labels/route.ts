import { labelInputSchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { createLabel } from "@/server/catalog";
import { parseBody, prisma, route } from "@/server/http";

export const POST = route(
  async (req) =>
    NextResponse.json(await createLabel(prisma, await parseBody(req, labelInputSchema)), {
      status: 201,
    }),
  { admin: true },
);
