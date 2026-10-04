import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { stampBlocks } from "./block-attribution";
import { getExtensions } from "./extensions";
import { fileKind, formatBytes } from "./files";

const schema = getSchema(getExtensions());
const para = (text: string, attrs = {}) =>
  schema.node("paragraph", attrs, text ? [schema.text(text)] : []);
const stateOf = (...blocks: ReturnType<typeof para>[]) =>
  EditorState.create({ schema, doc: schema.node("doc", null, blocks) });

const mario = { id: "u-mario" };
const NOW = 1_000_000;
const everything = (state: EditorState) => [{ from: 0, to: state.doc.content.size }];

describe("stampBlocks", () => {
  it("stamps the blocks inside the changed ranges only", () => {
    const state = stateOf(para("one"), para("two"));
    // Range covering only the first paragraph (positions 0..5).
    const tr = stampBlocks(state, [{ from: 1, to: 3 }], mario, NOW, 30_000)!;
    const [first, second] = tr.doc.content.content;
    expect(first?.attrs).toMatchObject({ lastEditedBy: "u-mario", lastEditedAt: NOW });
    expect(second?.attrs).toMatchObject({ lastEditedBy: null, lastEditedAt: null });
  });

  it("does not claim a block when the change only touches its edge (Enter at the end)", () => {
    // doc: <p>one</p><p></p>; "one" spans 1..4, the paragraph closes at 4, the new one opens at 5.
    const state = stateOf(
      para("one", { lastEditedBy: "u-anna", lastEditedAt: NOW - 1000 }),
      para(""),
    );
    const tr = stampBlocks(state, [{ from: 4, to: 6 }], mario, NOW, 30_000)!;
    const [first, second] = tr.doc.content.content;
    expect(first?.attrs.lastEditedBy).toBe("u-anna");
    expect(second?.attrs.lastEditedBy).toBe("u-mario");
  });

  it("stamps the block of a deletion (empty range) at any point of its content", () => {
    const state = stateOf(para("one"), para("two"));
    for (const at of [1, 2, 4]) {
      const tr = stampBlocks(state, [{ from: at, to: at }], mario, NOW, 30_000)!;
      expect(tr.doc.firstChild?.attrs.lastEditedBy).toBe("u-mario");
      expect(tr.doc.child(1).attrs.lastEditedBy).toBeNull();
    }
  });

  it("does not restamp a block of the same user within the refresh window", () => {
    const state = stateOf(para("one", { lastEditedBy: "u-mario", lastEditedAt: NOW - 1000 }));
    expect(stampBlocks(state, everything(state), mario, NOW, 30_000)).toBeNull();
  });

  it("restamps after the refresh window and when another user edits", () => {
    const old = stateOf(para("one", { lastEditedBy: "u-mario", lastEditedAt: NOW - 60_000 }));
    expect(stampBlocks(old, everything(old), mario, NOW, 30_000)).not.toBeNull();
    const other = stateOf(para("one", { lastEditedBy: "u-anna", lastEditedAt: NOW - 1000 }));
    const tr = stampBlocks(other, everything(other), mario, NOW, 30_000)!;
    expect(tr.doc.firstChild?.attrs.lastEditedBy).toBe("u-mario");
  });

  it("keeps the text and marks the transaction so it is never stamped twice", () => {
    const state = stateOf(para("keep me"));
    const tr = stampBlocks(state, everything(state), mario, NOW, 30_000)!;
    expect(tr.doc.textContent).toBe("keep me");
    expect(tr.getMeta("addToHistory")).toBe(false);
  });
});

describe("file helpers", () => {
  it("decides how a file is shown", () => {
    expect(fileKind("image/png")).toBe("image");
    expect(fileKind("image/jpeg")).toBe("image");
    expect(fileKind("application/pdf")).toBe("pdf");
    // SVG can carry scripts: never inline.
    expect(fileKind("image/svg+xml")).toBe("file");
    expect(fileKind("application/zip")).toBe("file");
  });
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(120 * 1024)).toBe("120 KB");
  });
});

describe("schema", () => {
  it("declares the file embed, attribution attributes and the author mark", () => {
    expect(schema.nodes.fileEmbed).toBeDefined();
    expect(schema.marks.ychange).toBeDefined();
    expect(schema.nodes.paragraph?.spec.attrs).toHaveProperty("lastEditedBy");
    expect(schema.nodes.heading?.spec.attrs).toHaveProperty("lastEditedAt");
  });
});
