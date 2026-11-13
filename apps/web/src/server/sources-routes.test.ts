import { describe, expect, it, vi } from "vitest";

let role: "admin" | "member" = "member";
vi.mock("../lib/session", () => ({
  getSession: async () => ({ user: { id: "route-user", role } }),
}));
process.env.JAKAB_TEST_SOURCES = "1";

const none = { params: Promise.resolve({} as Record<string, never>) };
const withId = { params: Promise.resolve({ id: "x" }) };
const request = (method: string, body?: unknown) =>
  new Request("http://localhost/api/sources", {
    method,
    ...(body !== undefined && {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  });

describe("source routes", () => {
  it("are for admins only, except reading the events", async () => {
    role = "member";
    const list = await import("../app/api/sources/route");
    const verify = await import("../app/api/sources/verify/route");
    const one = await import("../app/api/sources/[id]/route");
    const sync = await import("../app/api/sources/[id]/sync/route");
    const events = await import("../app/api/external-events/route");
    const refused = await Promise.all([
      list.GET(request("GET"), none),
      list.POST(request("POST", {}), none),
      verify.POST(request("POST", {}), none),
      one.PATCH(request("PATCH", {}), withId),
      one.DELETE(request("DELETE"), withId),
      sync.POST(request("POST"), withId),
    ]);
    expect(refused.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);

    const range = await events.GET(
      new Request("http://localhost/api/external-events?from=2026-11-01&to=2026-12-01"),
      none,
    );
    expect(range.status).toBe(200);
    expect(Array.isArray(await range.json())).toBe(true);
  });

  it("verify limits how often an admin can spend the provider's quota", async () => {
    role = "admin";
    const verify = await import("../app/api/sources/verify/route");
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      // An unknown kind answers 400 without leaving the server: only the limit is under test.
      const res = await verify.POST(request("POST", { kind: "nope" }), none);
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it("never answer with the key", async () => {
    role = "admin";
    const list = await import("../app/api/sources/route");
    const res = await list.GET(request("GET"), none);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toMatch(/"secret"|apiKey/);
  });
});
