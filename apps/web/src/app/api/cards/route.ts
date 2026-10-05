import { cardCreateSchema, cardRangeQuerySchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { createCard, listCards } from "@/server/cards";
import { parseBody, prisma, route } from "@/server/http";
import { getStorage } from "@/server/storage";

export const GET = route(async (req) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const { from, to } = cardRangeQuerySchema.parse(params);
  return listCards(prisma, from, to);
});

export const POST = route(async (req, { actor }) => {
  const input = await parseBody(req, cardCreateSchema);
  return NextResponse.json(await createCard(prisma, input, actor.id, { storage: getStorage() }), {
    status: 201,
  });
});
