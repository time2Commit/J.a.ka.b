import { createPrismaClient } from "@jakab/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createUser } from "./users";

let sessionUser: {
  id: string;
  role: string;
  deactivatedAt?: Date | null;
  mustChangePassword?: boolean;
} = {
  id: "nobody",
  role: "member",
};
vi.mock("../lib/session", () => ({
  getSession: async () => ({ user: sessionUser }),
}));
// The password hasher of the auth setup is slow on purpose: the routes only need one.
vi.mock("../lib/auth", () => ({
  auth: { $context: Promise.resolve({ password: { hash: async (p: string) => `hashed:${p}` } }) },
}));
// No collab server in unit tests: the call is under test in the collab package.
const disconnected: string[] = [];
vi.mock("./collab", () => ({
  disconnectFromNotes: async (_req: Request, userId: string) => {
    disconnected.push(userId);
    return true;
  },
}));

const prisma = createPrismaClient();
const run = `r${Date.now().toString(36)}`;
const fakeHash = async (password: string) => `hashed:${password}`;
let adminId: string;
let memberId: string;

const request = (method: string, body?: unknown) =>
  new Request("http://localhost/api/users/x", {
    method,
    ...(body !== undefined && {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const none = { params: Promise.resolve({} as Record<string, never>) };

beforeAll(async () => {
  const person = (name: string, role: "admin" | "member") =>
    createUser(
      prisma,
      { name, email: `${name.toLowerCase()}.${run}@example.com`, password: "password456", role },
      fakeHash,
    );
  adminId = (await person("Rita", "admin")).id;
  memberId = (await person("Sandro", "member")).id;
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `.${run}@example.com` } } });
  await prisma.$disconnect();
});

describe("user management routes", () => {
  it("are for administrators only", async () => {
    sessionUser = { id: memberId, role: "member" };
    const one = await import("../app/api/users/[id]/route");
    const reset = await import("../app/api/users/[id]/reset-password/route");
    const refused = await Promise.all([
      one.PATCH(request("PATCH", { role: "admin" }), params(memberId)),
      one.PATCH(request("PATCH", { active: false }), params(adminId)),
      reset.POST(request("POST", { password: "temporary1" }), params(adminId)),
    ]);
    expect(refused.map((r) => r.status)).toEqual([403, 403, 403]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: memberId } })).toMatchObject({
      role: "member",
    });
    expect(disconnected).toEqual([]);
  });

  it("refuse a session whose account was deactivated, on every route", async () => {
    sessionUser = { id: adminId, role: "admin", deactivatedAt: new Date() };
    const list = await import("../app/api/users/route");
    const one = await import("../app/api/users/[id]/route");
    const me = await import("../app/api/me/route");
    const refused = await Promise.all([
      list.GET(request("GET"), none),
      one.PATCH(request("PATCH", { active: false }), params(memberId)),
      me.PATCH(request("PATCH", { name: "Still here" }), none),
    ]);
    expect(refused.map((r) => r.status)).toEqual([403, 403, 403]);
  });

  it("refuse a session that still has a temporary password, on every route", async () => {
    sessionUser = { id: adminId, role: "admin", mustChangePassword: true };
    const list = await import("../app/api/users/route");
    const one = await import("../app/api/users/[id]/route");
    const me = await import("../app/api/me/route");
    const refused = await Promise.all([
      list.GET(request("GET"), none),
      one.PATCH(request("PATCH", { active: false }), params(memberId)),
      me.PATCH(request("PATCH", { name: "Not yet" }), none),
    ]);
    expect(refused.map((r) => r.status)).toEqual([403, 403, 403]);
    expect(await refused[0]!.json()).toMatchObject({ code: "password_change_required" });
  });

  it("deactivate an account and close its live note connections", async () => {
    sessionUser = { id: adminId, role: "admin" };
    const one = await import("../app/api/users/[id]/route");
    const res = await one.PATCH(request("PATCH", { active: false }), params(memberId));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ id: memberId, notesDisconnected: true });
    expect(body.deactivatedAt).toEqual(expect.any(String));
    expect(disconnected).toEqual([memberId]);

    // Reactivating or changing the role signs nobody out.
    await one.PATCH(request("PATCH", { active: true, role: "member" }), params(memberId));
    expect(disconnected).toEqual([memberId]);
  });

  it("validate the input and name the refusal of a change to oneself", async () => {
    sessionUser = { id: adminId, role: "admin" };
    const one = await import("../app/api/users/[id]/route");
    const reset = await import("../app/api/users/[id]/reset-password/route");
    expect((await one.PATCH(request("PATCH", { role: "owner" }), params(memberId))).status).toBe(
      400,
    );
    expect(
      (await reset.POST(request("POST", { password: "short" }), params(memberId))).status,
    ).toBe(400);
    const self = await one.PATCH(request("PATCH", { active: false }), params(adminId));
    expect(self.status).toBe(409);
    expect(await self.json()).toMatchObject({ code: "self" });
  });

  it("reset a password without ever answering with it, a limited number of times", async () => {
    sessionUser = { id: adminId, role: "admin" };
    disconnected.length = 0;
    const reset = await import("../app/api/users/[id]/reset-password/route");
    const first = await reset.POST(request("POST", { password: "temporary-1" }), params(memberId));
    expect(first.status).toBe(200);
    const text = await first.text();
    expect(text).not.toContain("temporary-1");
    expect(JSON.parse(text)).toEqual({ notesDisconnected: true });
    expect(disconnected).toEqual([memberId]);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: memberId } })).toMatchObject({
      mustChangePassword: true,
    });
    expect(await prisma.account.findFirstOrThrow({ where: { userId: memberId } })).toMatchObject({
      password: "hashed:temporary-1",
    });

    // Ten every ten minutes for each administrator: this test and the refused "short" one of
    // the test above already spent two.
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      statuses.push(
        (await reset.POST(request("POST", { password: "temporary-2" }), params(memberId))).status,
      );
    }
    expect(statuses.slice(0, 8).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(8)).toEqual([429, 429]);
  });
});
