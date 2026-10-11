import { describe, expect, it } from "vitest";
import { normalizeLinkUrl } from "./link";

describe("normalizeLinkUrl", () => {
  it("keeps absolute web, mail and phone addresses", () => {
    expect(normalizeLinkUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(normalizeLinkUrl("http://example.com")).toBe("http://example.com");
    expect(normalizeLinkUrl("mailto:team@example.com")).toBe("mailto:team@example.com");
    expect(normalizeLinkUrl("tel:+390000000")).toBe("tel:+390000000");
  });

  it("adds https:// when the scheme is missing", () => {
    expect(normalizeLinkUrl("example.com")).toBe("https://example.com");
    expect(normalizeLinkUrl("  www.example.com/x ")).toBe("https://www.example.com/x");
    expect(normalizeLinkUrl("//example.com")).toBe("https://example.com");
  });

  it("turns an e-mail address into a mailto link", () => {
    expect(normalizeLinkUrl("anna@example.com")).toBe("mailto:anna@example.com");
  });

  it("rejects empty values and unsafe schemes", () => {
    expect(normalizeLinkUrl("   ")).toBeNull();
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("data:text/html,x")).toBeNull();
  });
});
