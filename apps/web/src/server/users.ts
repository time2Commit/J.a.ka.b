import type { Prisma, PrismaClient } from "@jakab/db";
import type { AccountUpdateInput, UserCreateInput, UserUpdateInput } from "@jakab/shared";
import { randomUUID } from "node:crypto";
import { conflict, HttpError, notFound } from "./errors";
import { notifyBoardChanged } from "./notify";

const AVATAR_COLORS = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#8b5cf6", "#ef4444"];

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  avatarColor: true,
  deactivatedAt: true,
} as const;

/**
 * Everyone, deactivated accounts included: they stay the authors of what they wrote and stay on
 * the cards they were assigned to. Pickers for new assignments leave them out (`deactivatedAt`).
 */
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
  /**
   * `mustChangePassword`: the password is a temporary one somebody else knows. `deactivatedAt`: the
   * account is re-created as it was in an archive, where it had been deactivated.
   */
  extra: { mustChangePassword?: boolean; deactivatedAt?: Date | null } = {},
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
      mustChangePassword: extra.mustChangePassword ?? false,
      deactivatedAt: extra.deactivatedAt ?? null,
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

/**
 * A person changes their own account (for now only the name). Other people see the name on cards,
 * in the people pickers and in mentions, so every open board is told.
 */
export function updateOwnAccount(db: PrismaClient, userId: string, input: AccountUpdateInput) {
  return db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { ...(input.name !== undefined && { name: input.name }) },
      select: publicUserSelect,
    });
    if (input.name !== undefined) await notifyBoardChanged(tx, "user", userId);
    return user;
  });
}

/** An administrator tried to change their own account here; the settings page has words for it. */
const cannotChangeSelf = () =>
  new HttpError(409, "Administrators cannot deactivate, demote or reset themselves", "self");

/**
 * Serialises the changes that decide who may sign in and who administers, and checks again,
 * inside the lock, that the caller still is an active administrator.
 *
 * Together with "nobody deactivates or demotes themselves" this keeps at least one active
 * administrator at all times: whoever makes the change stays one. Without the lock, two
 * administrators could demote or deactivate each other at the same moment and leave nobody in
 * charge; with it, the second of the two is refused.
 */
async function lockAccounts(tx: Prisma.TransactionClient, actorId: string) {
  await tx.$queryRaw`SELECT id FROM "user" FOR UPDATE`;
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: { role: true, deactivatedAt: true },
  });
  if (!actor || actor.role !== "admin" || actor.deactivatedAt) {
    throw new HttpError(403, "Forbidden");
  }
}

/**
 * An administrator changes somebody's name, role or whether the account is active.
 *
 * - Nobody deactivates or demotes themselves.
 * - At least one active administrator always remains (see `lockAccounts`).
 * - Deactivating closes every session of that person in the same transaction; the caller then
 *   closes their live note connections (`disconnectFromNotes`).
 *
 * `sessionsClosed` tells the caller whether there is anybody to disconnect.
 */
export function updateUser(
  db: PrismaClient,
  actorId: string,
  userId: string,
  input: UserUpdateInput,
) {
  return db.$transaction(async (tx) => {
    await lockAccounts(tx, actorId);
    const target = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, deactivatedAt: true },
    });
    if (!target) throw notFound("User");

    const wasActive = target.deactivatedAt === null;
    const role = input.role ?? target.role;
    const active = input.active ?? wasActive;
    if (userId === actorId && (role !== "admin" || !active)) throw cannotChangeSelf();

    const deactivating = wasActive && !active;
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.role !== undefined && { role: input.role }),
        ...(deactivating && { deactivatedAt: new Date() }),
        ...(!wasActive && active && { deactivatedAt: null }),
      },
      select: publicUserSelect,
    });
    if (deactivating) await tx.session.deleteMany({ where: { userId } });
    // Every open board refreshes its people; the streams of this person check their session again.
    await notifyBoardChanged(tx, "user", userId);
    return { user, sessionsClosed: deactivating };
  });
}

/**
 * An administrator sets a temporary password for somebody else (there is no email to send a link
 * to). The person is signed out everywhere and has to choose a new password at the next sign-in.
 * `passwordHash` is already hashed: the plain password never reaches this module.
 */
export function resetUserPassword(
  db: PrismaClient,
  actorId: string,
  userId: string,
  passwordHash: string,
) {
  return db.$transaction(async (tx) => {
    await lockAccounts(tx, actorId);
    // Their own password is changed from the account page, with the current one.
    if (userId === actorId) throw cannotChangeSelf();
    if (!(await tx.user.findUnique({ where: { id: userId }, select: { id: true } }))) {
      throw notFound("User");
    }
    const { count } = await tx.account.updateMany({
      where: { userId, providerId: "credential" },
      data: { password: passwordHash },
    });
    if (count === 0) {
      await tx.account.create({
        data: {
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: passwordHash,
        },
      });
    }
    await tx.user.update({ where: { id: userId }, data: { mustChangePassword: true } });
    await tx.session.deleteMany({ where: { userId } });
    await notifyBoardChanged(tx, "user", userId);
  });
}
