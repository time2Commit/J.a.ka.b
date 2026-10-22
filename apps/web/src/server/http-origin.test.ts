import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/session", () => ({
  getSession: async () => ({ user: { id: "origin-user", role: "member" } }),
}));

const APP = "https://jakab.example.com";
const call =
  (handler: (req: Request, ctx: { params: Promise<object> }) => Promise<Response>) =>
  (method: string, origin?: string) =>
    handler(new Request(`${APP}/api/x`, { method, headers: origin ? { origin } : {} }), {
      params: Promise.resolve({}),
    });

describe("same-origin check on API routes", () => {
  it("refuses a change that a page on another origin asks the browser to make", async () => {
    vi.stubEnv("APP_URL", APP);
    const { route } = await import("./http");
    const send = call(route(async () => ({ ok: true })));

    const refused = await send("POST", "https://evil.example.com");
    expect(refused.status).toBe(403);
    expect((await send("DELETE", "https://jakab.example.com.evil.example.com")).status).toBe(403);
    expect((await send("PATCH", "http://jakab.example.com")).status).toBe(403);
    vi.unstubAllEnvs();
  });

  it("lets the app's own origin, reads, and calls without Origin through", async () => {
    vi.stubEnv("APP_URL", APP);
    const { route } = await import("./http");
    const send = call(route(async () => ({ ok: true })));

    expect((await send("POST", APP)).status).toBe(200);
    expect((await send("POST")).status).toBe(200);
    expect((await send("GET", "https://evil.example.com")).status).toBe(200);
    vi.unstubAllEnvs();
  });
});
