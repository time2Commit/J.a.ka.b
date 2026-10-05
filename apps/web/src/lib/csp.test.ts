import { describe, expect, it } from "vitest";
import { buildCsp, collabOrigin, isHttps } from "./csp";

describe("collabOrigin", () => {
  it("takes the origin of the public collab URL and survives a bad value", () => {
    expect(collabOrigin({ COLLAB_PUBLIC_URL: "wss://notes.example.com/collab" })).toBe(
      "wss://notes.example.com",
    );
    expect(collabOrigin({})).toBe("ws://localhost:1234");
    expect(collabOrigin({ COLLAB_PUBLIC_URL: "not a url" })).toBe("ws://localhost:1234");
  });
});

describe("buildCsp", () => {
  const env = { COLLAB_PUBLIC_URL: "wss://notes.example.com/collab" };
  const csp = buildCsp({ nonce: "abc123", env });
  const directive = (name: string) =>
    csp
      .split("; ")
      .find((d) => d.startsWith(`${name} `))
      ?.split(" ")
      .slice(1);

  it("lets scripts run only with the nonce and never allows inline or eval in production", () => {
    expect(directive("script-src")).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(csp).not.toContain("unsafe-eval");
    expect(directive("script-src")).not.toContain("'unsafe-inline'");
  });

  it("allows the collab WebSocket and nothing else cross-origin", () => {
    expect(directive("connect-src")).toEqual(["'self'", "wss://notes.example.com"]);
    expect(directive("default-src")).toEqual(["'self'"]);
  });

  it("blocks framing by other sites, plugins from elsewhere and base tag tricks", () => {
    expect(directive("frame-ancestors")).toEqual(["'self'"]);
    expect(directive("object-src")).toEqual(["'self'"]);
    expect(directive("base-uri")).toEqual(["'self'"]);
    expect(directive("form-action")).toEqual(["'self'"]);
  });

  it("adds eval only in development", () => {
    expect(buildCsp({ nonce: "n", dev: true, env })).toContain("'unsafe-eval'");
  });
});

describe("isHttps", () => {
  it("detects an https public URL", () => {
    expect(isHttps("https://jakab.example.com")).toBe(true);
    expect(isHttps("http://localhost:3000")).toBe(false);
    expect(isHttps(undefined)).toBe(false);
  });
});
