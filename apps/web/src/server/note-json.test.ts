import { describe, expect, it } from "vitest";
import { checklistNode, filterFileEmbeds, mapNoteIds, noteFromTemplate } from "./note-json";

describe("mapNoteIds", () => {
  const note = {
    type: "doc",
    content: [
      { type: "fileEmbed", attrs: { attachmentId: "a1", name: "x.png" } },
      {
        type: "bulletList",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "mention", attrs: { id: "u1", label: "Anna" } },
              { type: "text", text: "a1 stays text" },
            ],
          },
        ],
      },
    ],
  };

  it("rewrites attachment and mention ids at any depth and leaves the original untouched", () => {
    const copy = mapNoteIds(note, {
      attachment: (id) => `new-${id}`,
      mention: (id) => `person-${id}`,
    });
    expect(JSON.stringify(copy)).toContain('"attachmentId":"new-a1"');
    expect(JSON.stringify(copy)).toContain('"id":"person-u1"');
    expect(JSON.stringify(copy)).toContain('"label":"Anna"');
    expect(JSON.stringify(copy)).toContain('"text":"a1 stays text"');
    expect(JSON.stringify(note)).toContain('"attachmentId":"a1"');
  });

  it("changes nothing without maps", () => {
    expect(mapNoteIds(note, {})).toEqual(note);
  });
});

describe("filterFileEmbeds", () => {
  const note = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "keep me" }] },
      { type: "fileEmbed", attrs: { attachmentId: "a" } },
      {
        type: "blockquote",
        content: [{ type: "fileEmbed", attrs: { attachmentId: "b" } }],
      },
    ],
  };
  it("drops every embed by default, at any depth", () => {
    const out = JSON.stringify(filterFileEmbeds(note));
    expect(out).not.toContain("fileEmbed");
    expect(out).toContain("keep me");
  });
  it("keeps the listed attachments", () => {
    const out = JSON.stringify(filterFileEmbeds(note, new Set(["b"])));
    expect(out).toContain('"attachmentId":"b"');
    expect(out).not.toContain('"attachmentId":"a"');
  });
});

describe("noteFromTemplate", () => {
  it("appends the checklist after the content, and is null when both are empty", () => {
    const body = { type: "doc", content: [{ type: "paragraph" }] };
    const note = noteFromTemplate(body, ["Call", "Write"])!;
    expect(note.content).toHaveLength(2);
    expect(JSON.stringify(note.content![1])).toContain('"checked":false');
    expect(JSON.stringify(note.content![1])).toContain("Write");
    expect(noteFromTemplate(null, [])).toBeNull();
    expect(noteFromTemplate({ type: "doc" }, [])).toBeNull();
    expect(checklistNode([])).toBeNull();
  });
});
