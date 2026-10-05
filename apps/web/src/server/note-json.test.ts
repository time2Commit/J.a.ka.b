import { describe, expect, it } from "vitest";
import { mapNoteIds } from "./note-json";

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
