import { describe, expect, it } from "vitest";
import { bootstrapTokenAccepted, configuredBootstrapToken } from "./bootstrap-token";

describe("bootstrapTokenAccepted", () => {
  it("lets the first account through when no token is configured", () => {
    expect(bootstrapTokenAccepted(null, null)).toBe(true);
    expect(bootstrapTokenAccepted(null, "anything")).toBe(true);
  });

  it("requires the exact token when one is configured", () => {
    expect(bootstrapTokenAccepted("s3cret-token", null)).toBe(false);
    expect(bootstrapTokenAccepted("s3cret-token", "")).toBe(false);
    expect(bootstrapTokenAccepted("s3cret-token", "s3cret-toke")).toBe(false);
    expect(bootstrapTokenAccepted("s3cret-token", "S3CRET-TOKEN")).toBe(false);
    expect(bootstrapTokenAccepted("s3cret-token", "s3cret-token")).toBe(true);
    expect(bootstrapTokenAccepted("s3cret-token", " s3cret-token ")).toBe(true);
  });

  it("treats an empty setting as no token", () => {
    expect(configuredBootstrapToken({ BOOTSTRAP_TOKEN: "  " })).toBeNull();
    expect(configuredBootstrapToken({})).toBeNull();
    expect(configuredBootstrapToken({ BOOTSTRAP_TOKEN: " abc " })).toBe("abc");
  });
});
