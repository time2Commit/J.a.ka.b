import { describe, expect, it } from "vitest";
import { limiterFor, RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit per window, then refuses with the time left", () => {
    const limiter = new RateLimiter(3, 1000);
    expect([1, 2, 3].map(() => limiter.hit("a", 0).allowed)).toEqual([true, true, true]);
    expect(limiter.hit("a", 100)).toEqual({ allowed: false, retryAfterMs: 900 });
  });

  it("starts a new window when the old one has passed, and counts keys separately", () => {
    const limiter = new RateLimiter(1, 1000);
    expect(limiter.hit("a", 0).allowed).toBe(true);
    expect(limiter.hit("a", 500).allowed).toBe(false);
    expect(limiter.hit("b", 500).allowed).toBe(true);
    expect(limiter.hit("a", 1000).allowed).toBe(true);
  });

  it("shares one limiter between rules with the same name", () => {
    const rule = { name: "shared-test", limit: 1, windowMs: 1000 };
    expect(limiterFor(rule)).toBe(limiterFor({ ...rule }));
  });
});
