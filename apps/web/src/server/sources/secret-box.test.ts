import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, SecretUnreadable } from "./secret-box";

const SECRET = "test-only-secret-with-at-least-thirty-two-chars";

describe("secret box", () => {
  it("gets back what it was given", () => {
    const box = encryptSecret('{"apiKey":"abcd1234efgh"}', SECRET);
    expect(decryptSecret(box, SECRET)).toBe('{"apiKey":"abcd1234efgh"}');
  });

  it("never stores the text in the clear, and never the same box twice", () => {
    const a = encryptSecret("abcd1234efgh", SECRET);
    const b = encryptSecret("abcd1234efgh", SECRET);
    expect(a).not.toContain("abcd1234efgh");
    expect(a).not.toBe(b);
  });

  it("refuses a box that was altered", () => {
    const [version, iv, tag, data] = encryptSecret("abcd1234efgh", SECRET).split(".");
    const flipped = `${data!.slice(0, -2)}${data!.endsWith("AA") ? "BB" : "AA"}`;
    expect(() => decryptSecret([version, iv, tag, flipped].join("."), SECRET)).toThrow(
      SecretUnreadable,
    );
    expect(() =>
      decryptSecret([version, iv, "AAAAAAAAAAAAAAAAAAAAAA", data].join("."), SECRET),
    ).toThrow(SecretUnreadable);
  });

  it("cannot be read under another AUTH_SECRET", () => {
    const box = encryptSecret("abcd1234efgh", SECRET);
    expect(() => decryptSecret(box, `${SECRET}-changed`)).toThrow(SecretUnreadable);
  });

  it("refuses text that is not a box", () => {
    for (const bad of ["", "v1", "v2.a.b.c", "plain text", "v1.a.b"]) {
      expect(() => decryptSecret(bad, SECRET)).toThrow(SecretUnreadable);
    }
  });
});
