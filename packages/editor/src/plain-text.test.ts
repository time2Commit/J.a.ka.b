import { describe, expect, it } from "vitest";
import { foldForSearch, jsonToPlainText } from "./plain-text";

const text = (t: string, marks?: { type: string }[]) => ({
  type: "text",
  text: t,
  ...(marks && { marks }),
});

describe("jsonToPlainText", () => {
  it("joins formatted runs into one word and puts a line break after each block", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [text("Plan")] },
        {
          type: "paragraph",
          content: [text("he"), text("llo", [{ type: "bold" }]), text(" world")],
        },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [text("first")] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [text("second")] }] },
          ],
        },
      ],
    };
    expect(jsonToPlainText(doc)).toBe("Plan\nhello world\nfirst\n\nsecond");
  });

  it("reads mentions, file names, line breaks and table cells", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            text("ping "),
            { type: "mention", attrs: { id: "u1", label: "Anna" } },
            { type: "hardBreak" },
            text("after"),
          ],
        },
        {
          type: "fileEmbed",
          attrs: { attachmentId: "a", name: "budget.pdf", mime: "application/pdf" },
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [{ type: "paragraph", content: [text("A1")] }] },
                { type: "tableCell", content: [{ type: "paragraph", content: [text("B1")] }] },
              ],
            },
          ],
        },
      ],
    };
    const result = jsonToPlainText(doc);
    expect(result).toContain("ping @Anna\nafter");
    expect(result).toContain("budget.pdf");
    expect(result).toMatch(/A1\s+B1/);
  });

  it("returns an empty string for nothing", () => {
    expect(jsonToPlainText(null)).toBe("");
    expect(jsonToPlainText({ type: "doc" })).toBe("");
  });
});

describe("foldForSearch", () => {
  it("lower-cases and drops accents without changing the length", () => {
    const original = "Perché ÀÈÌÒÙ Straße İstanbul";
    const folded = foldForSearch(original);
    expect(folded.startsWith("perche aeiou")).toBe(true);
    expect([...folded].length).toBe([...original].length);
  });
});
