import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@jakab/db";
import { createUser } from "./users";

const prisma = createPrismaClient();
const email = `anna.${Date.now().toString(36)}@example.com`;
const fakeHash = async (password: string) => `hashed:${password}`;

afterAll(async () => {
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
