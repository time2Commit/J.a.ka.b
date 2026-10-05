import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { canonicalJson, diffBlocks } from "./diff";

const p = (text: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const doc = (...texts: string[]): JSONContent => ({ type: "doc", content: texts.map(p) });
const texts = (d: JSONContent) => d.content?.map((n) => n.content?.[0]?.text);

describe("canonicalJson", () => {
  it("ignores key order but not content", () => {
    expect(canonicalJson({ a: 1, b: { c: [1, 2], d: "x" } })).toBe(
      canonicalJson({ b: { d: "x", c: [1, 2] }, a: 1 }),
    );
    expect(canonicalJson({ a: [1, 2] })).not.toBe(canonicalJson({ a: [2, 1] }));
    expect(canonicalJson({ a: 1, b: undefined })).toBe(canonicalJson({ a: 1 }));
  });
});

describe("diffBlocks", () => {
  it("reports no change for equal notes", () => {
    const result = diffBlocks(doc("a", "b"), doc("a", "b"));
    expect(result.changed).toBe(false);
    expect(result.changes).toEqual(["same", "same"]);
  });

  it("marks added and removed blocks in reading order", () => {
    const result = diffBlocks(doc("intro", "old", "end"), doc("intro", "new", "end", "extra"));
    expect(texts(result.doc)).toEqual(["intro", "old", "new", "end", "extra"]);
    expect(result.changes).toEqual(["same", "removed", "added", "same", "added"]);
    expect(result.changed).toBe(true);
  });

  it("does not flag everything below an insertion", () => {
    const result = diffBlocks(doc("a", "b", "c"), doc("a", "NEW", "b", "c"));
    expect(result.changes).toEqual(["same", "added", "same", "same"]);
  });

  it("handles empty or missing documents", () => {
    expect(diffBlocks(null, doc("a")).changes).toEqual(["added"]);
    expect(diffBlocks(doc("a"), { type: "doc" }).changes).toEqual(["removed"]);
    expect(diffBlocks(null, null).changed).toBe(false);
  });
});
