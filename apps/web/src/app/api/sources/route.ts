import { sourceConnectSchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { parseBody, prisma, route } from "@/server/http";
import { connectSource, listConnectedSources } from "@/server/sources";

export const GET = route(async () => listConnectedSources(prisma), { admin: true });

export const POST = route(
  async (req) =>
    NextResponse.json(await connectSource(prisma, await parseBody(req, sourceConnectSchema)), {
      status: 201,
    }),
  { admin: true },
);
