import { describe, expect, it, vi } from "vitest";

// The route wrapper needs a signed-in user: provide one without the auth stack.
vi.mock("../lib/session", () => ({
  getSession: async () => ({ user: { id: "limited-user", role: "member" } }),
}));

describe("route rate limit", () => {
  it("answers 429 with Retry-After once a user is over the rule", async () => {
    const { route } = await import("./http");
    const handler = route(async () => ({ ok: true }), {
      rateLimit: { name: "route-test", limit: 2, windowMs: 60_000 },
    });
    const call = () => handler(new Request("http://localhost/x"), { params: Promise.resolve({}) });

    expect((await call()).status).toBe(200);
    expect((await call()).status).toBe(200);
    const refused = await call();
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await refused.json()).toMatchObject({ error: expect.stringMatching(/too many/i) });
  });
});
