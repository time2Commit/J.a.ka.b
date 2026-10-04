import type { PrismaClient } from "@jakab/db";
import type { UserCreateInput } from "@jakab/shared";
import { randomUUID } from "node:crypto";
import { conflict } from "./errors";

const AVATAR_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444"];

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarColor: true,
} as const;

export const listUsers = (db: PrismaClient) =>
  db.user.findMany({ select: publicUserSelect, orderBy: { name: "asc" } });

/**
 * Admin-created account. Written directly (user + credential account) so that no session
 * is created and the first-user/sign-up rules of the auth hooks do not apply.
 */
export async function createUser(
  db: PrismaClient,
  input: UserCreateInput,
  hashPassword: (password: string) => Promise<string>,
) {
  if (await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw conflict("Email already in use");
  }
  const id = randomUUID();
  const count = await db.user.count();
  return db.user.create({
    data: {
      id,
      name: input.name,
      email: input.email,
      role: input.role,
      avatarColor: AVATAR_COLORS[count % AVATAR_COLORS.length]!,
      accounts: {
        create: {
          id: randomUUID(),
          accountId: id,
          providerId: "credential",
          password: await hashPassword(input.password),
        },
      },
    },
    select: publicUserSelect,
  });
}
