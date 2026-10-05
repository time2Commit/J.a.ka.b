import { describe, expect, it } from "vitest";
import { resolveAuthSecret } from "./auth-secret";

const strong = "x".repeat(40);

describe("resolveAuthSecret", () => {
  it("accepts a long secret in production", () => {
    expect(resolveAuthSecret({ NODE_ENV: "production", AUTH_SECRET: strong })).toBe(strong);
  });

  it("refuses a missing, short or placeholder secret in production", () => {
    const prod = { NODE_ENV: "production" };
    expect(() => resolveAuthSecret(prod)).toThrow(/required/);
    expect(() => resolveAuthSecret({ ...prod, AUTH_SECRET: "short" })).toThrow(/32 characters/);
    expect(() =>
      resolveAuthSecret({ ...prod, AUTH_SECRET: "change-me-to-a-long-random-string" }),
    ).toThrow();
  });

  it("falls back to a development secret outside production and during the build", () => {
    expect(resolveAuthSecret({ NODE_ENV: "development" })).toMatch(/dev-only/);
    expect(
      resolveAuthSecret({ NODE_ENV: "production", NEXT_PHASE: "phase-production-build" }),
    ).toMatch(/dev-only/);
  });
});
