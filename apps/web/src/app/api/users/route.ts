import { userCreateSchema } from "@jakab/shared";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseBody, prisma, route } from "@/server/http";
import { createUser, listUsers } from "@/server/users";

export const GET = route(() => listUsers(prisma));

export const POST = route(
  async (req) => {
    const input = await parseBody(req, userCreateSchema);
    const { password } = await auth.$context;
    return NextResponse.json(await createUser(prisma, input, password.hash), { status: 201 });
  },
  { admin: true },
);
