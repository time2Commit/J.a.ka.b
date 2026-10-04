import { describe, expect, it } from "vitest";
import { Doc } from "yjs";
import {
  isEmptyDocument,
  jsonToYdoc,
  noteDocumentName,
  parseNoteDocumentName,
  ydocToJson,
} from "./index";

const sample = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plan" }] },
    {
      type: "taskList",
      content: [
        {
          type: "taskItem",
          attrs: { checked: true },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Done" }] }],
        },
      ],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "bold", marks: [{ type: "bold" }] },
        { type: "text", text: " and " },
        { type: "text", text: "marked", marks: [{ type: "highlight", attrs: { color: "#ff0" } }] },
      ],
    },
  ],
};

describe("note documents", () => {
  it("round-trips editor JSON through a Yjs document", () => {
    const json = ydocToJson(jsonToYdoc(sample));
    expect(json.content?.map((n) => n.type)).toEqual(["heading", "taskList", "paragraph"]);
    expect(json.content?.[0]?.content?.[0]?.text).toBe("Plan");
    expect(json.content?.[1]?.content?.[0]?.attrs?.checked).toBe(true);
    expect(json.content?.[2]?.content?.[2]?.marks?.[0]?.type).toBe("highlight");
  });

  it("keeps the content when the Yjs state is encoded and applied elsewhere", async () => {
    const { encodeStateAsUpdate, applyUpdate } = await import("yjs");
    const copy = new Doc();
    applyUpdate(copy, encodeStateAsUpdate(jsonToYdoc(sample)));
    expect(ydocToJson(copy)).toEqual(ydocToJson(jsonToYdoc(sample)));
  });

  it("detects empty documents", () => {
    expect(isEmptyDocument(null)).toBe(true);
    expect(isEmptyDocument({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
    expect(isEmptyDocument(sample)).toBe(false);
  });

  it("names and parses project documents", () => {
    expect(parseNoteDocumentName(noteDocumentName("abc"))).toBe("abc");
    expect(parseNoteDocumentName("other:abc")).toBeNull();
    expect(parseNoteDocumentName("project:")).toBeNull();
  });
});
