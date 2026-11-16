import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@jakab/db";
import { createUser, resetUserPassword, updateOwnAccount, updateUser } from "./users";

const prisma = createPrismaClient();
const email = `anna.${Date.now().toString(36)}@example.com`;
const run = `u${Date.now().toString(36)}`;
const fakeHash = async (password: string) => `hashed:${password}`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `.${run}@example.com` } } });
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

describe("createUser", () => {
  it("creates the user with a credential account and never exposes the hash", async () => {
    const user = await createUser(
      prisma,
      { name: "Anna Bianchi", email, password: "password456", role: "member" },
      fakeHash,
    );
    expect(user).toMatchObject({ email, role: "member" });
    expect(JSON.stringify(user)).not.toContain("hashed:");
    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id } });
    expect(account).toMatchObject({ providerId: "credential", password: "hashed:password456" });
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("rejects a duplicate email", async () => {
    await expect(
      createUser(
        prisma,
        { name: "Other", email, password: "password456", role: "member" },
        fakeHash,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("updateOwnAccount", () => {
  it("renames the person and leaves everything else alone", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { email } });
    const user = await updateOwnAccount(prisma, before.id, { name: "Anna Verdi" });
    expect(user).toEqual({
      id: before.id,
      name: "Anna Verdi",
      email,
      role: "member",
      avatarColor: before.avatarColor,
      deactivatedAt: null,
    });
  });

  it("changes nothing for an empty update", async () => {
    const before = await prisma.user.findUniqueOrThrow({ where: { email } });
    await updateOwnAccount(prisma, before.id, {});
    const after = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(after.name).toBe("Anna Verdi");
  });
});

describe("account management by administrators", () => {
  const person = (name: string, role: "admin" | "member") =>
    createUser(
      prisma,
      { name, email: `${name.toLowerCase()}.${run}@example.com`, password: "password456", role },
      fakeHash,
    );
  const openSession = (userId: string) =>
    prisma.session.create({
      data: {
        id: `${userId}-${Math.random().toString(36).slice(2)}`,
        token: `${userId}-${Math.random().toString(36).slice(2)}`,
        userId,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
  const sessionsOf = (userId: string) => prisma.session.count({ where: { userId } });

  it("deactivates an account, closes its sessions, and reactivates it", async () => {
    const admin = await person("Ada", "admin");
    const member = await person("Bruno", "member");
    await openSession(member.id);
    await openSession(member.id);
    await openSession(admin.id);

    const off = await updateUser(prisma, admin.id, member.id, { active: false });
    expect(off.sessionsClosed).toBe(true);
    expect(off.user.deactivatedAt).toBeInstanceOf(Date);
    expect(await sessionsOf(member.id)).toBe(0);
    expect(await sessionsOf(admin.id)).toBe(1);

    // Deactivating again keeps the first date and has nobody left to sign out.
    const again = await updateUser(prisma, admin.id, member.id, { active: false });
    expect(again.sessionsClosed).toBe(false);
    expect(again.user.deactivatedAt).toEqual(off.user.deactivatedAt);

    const on = await updateUser(prisma, admin.id, member.id, { active: true });
    expect(on).toMatchObject({ sessionsClosed: false, user: { deactivatedAt: null } });
  });

  it("changes a role and a name without touching sessions", async () => {
    const admin = await person("Carla", "admin");
    const member = await person("Dario", "member");
    await openSession(member.id);
    const result = await updateUser(prisma, admin.id, member.id, {
      role: "admin",
      name: "Dario B",
    });
    expect(result).toMatchObject({
      sessionsClosed: false,
      user: { role: "admin", name: "Dario B" },
    });
    expect(await sessionsOf(member.id)).toBe(1);
    // An empty update changes nothing.
    expect((await updateUser(prisma, admin.id, member.id, {})).user).toMatchObject({
      role: "admin",
      name: "Dario B",
      deactivatedAt: null,
    });
  });

  it("refuses administrators who deactivate, demote or reset themselves", async () => {
    const admin = await person("Elena", "admin");
    const self = { status: 409, code: "self" };
    await expect(updateUser(prisma, admin.id, admin.id, { active: false })).rejects.toMatchObject(
      self,
    );
    await expect(updateUser(prisma, admin.id, admin.id, { role: "member" })).rejects.toMatchObject(
      self,
    );
    await expect(resetUserPassword(prisma, admin.id, admin.id, "hashed:new")).rejects.toMatchObject(
      self,
    );
    // Their own name, or a change that changes nothing, is fine.
    await updateUser(prisma, admin.id, admin.id, { name: "Elena R", role: "admin", active: true });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).toMatchObject({
      name: "Elena R",
      role: "admin",
      deactivatedAt: null,
    });
  });

  it("refuses callers who are not active administrators any more", async () => {
    const first = await person("Fabio", "admin");
    const second = await person("Gina", "admin");
    const member = await person("Hugo", "member");
    await expect(updateUser(prisma, member.id, first.id, { active: false })).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      resetUserPassword(prisma, member.id, first.id, "hashed:new"),
    ).rejects.toMatchObject({ status: 403 });

    // Two administrators turn on each other: the first change wins, the second is refused, so
    // somebody is always left in charge.
    await updateUser(prisma, first.id, second.id, { role: "member" });
    await expect(updateUser(prisma, second.id, first.id, { role: "member" })).rejects.toMatchObject(
      { status: 403 },
    );
    await updateUser(prisma, first.id, second.id, { role: "admin", active: false });
    await expect(updateUser(prisma, second.id, first.id, { active: false })).rejects.toMatchObject({
      status: 403,
    });
    expect(await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
      role: "admin",
      deactivatedAt: null,
    });
  });

  it("answers 404 for an account that does not exist", async () => {
    const admin = await person("Irene", "admin");
    await expect(updateUser(prisma, admin.id, "missing", { active: false })).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      resetUserPassword(prisma, admin.id, "missing", "hashed:new"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("resets a password: new hash, forced change, every session closed", async () => {
    const admin = await person("Lara", "admin");
    const member = await person("Marco", "member");
    await openSession(member.id);
    await resetUserPassword(prisma, admin.id, member.id, "hashed:temporary");
    expect(await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).toMatchObject({
      mustChangePassword: true,
      deactivatedAt: null,
    });
    const accounts = await prisma.account.findMany({ where: { userId: member.id } });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ providerId: "credential", password: "hashed:temporary" });
    expect(await sessionsOf(member.id)).toBe(0);
  });

  it("gives a credential account to somebody who had none", async () => {
    const admin = await person("Nora", "admin");
    const member = await person("Omar", "member");
    await prisma.account.deleteMany({ where: { userId: member.id } });
    await resetUserPassword(prisma, admin.id, member.id, "hashed:temporary");
    expect(await prisma.account.findFirstOrThrow({ where: { userId: member.id } })).toMatchObject({
      providerId: "credential",
      accountId: member.id,
      password: "hashed:temporary",
    });
  });

  it("creates an account that must change its password, or that is already deactivated", async () => {
    const when = new Date("2026-11-01T10:00:00.000Z");
    const user = await createUser(
      prisma,
      { name: "Piero", email: `piero.${run}@example.com`, password: "password456", role: "member" },
      fakeHash,
      { mustChangePassword: true, deactivatedAt: when },
    );
    expect(user.deactivatedAt).toEqual(when);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({
      mustChangePassword: true,
    });
  });
});
