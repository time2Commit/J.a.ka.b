import { statusInputSchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { createStatus } from "@/server/catalog";
import { parseBody, prisma, route } from "@/server/http";

export const POST = route(
  async (req) =>
    NextResponse.json(await createStatus(prisma, await parseBody(req, statusInputSchema)), {
      status: 201,
    }),
  { admin: true },
);
