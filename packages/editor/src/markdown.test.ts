import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { jsonToMarkdown } from "./markdown";

const text = (t: string, marks?: JSONContent["marks"]): JSONContent => ({
  type: "text",
  text: t,
  marks,
});
const p = (...c: JSONContent[]): JSONContent => ({ type: "paragraph", content: c });
const doc = (...c: JSONContent[]): JSONContent => ({ type: "doc", content: c });

describe("jsonToMarkdown", () => {
  it("renders headings, emphasis, links and escapes markup characters", () => {
    const md = jsonToMarkdown(
      doc(
        { type: "heading", attrs: { level: 2 }, content: [text("Plan")] },
        p(
          text("a *star* ", undefined),
          text("bold", [{ type: "bold" }]),
          text(" and "),
          text("site", [{ type: "link", attrs: { href: "https://example.com/a b" } }]),
        ),
      ),
    );
    expect(md).toBe("## Plan\n\na \\*star\\* **bold** and [site](https://example.com/a%20b)\n");
  });

  it("keeps spaces outside emphasis markers", () => {
    expect(jsonToMarkdown(doc(p(text("x"), text(" hi ", [{ type: "bold" }]), text("y"))))).toBe(
      "x **hi** y\n",
    );
  });

  it("renders nested lists and checklists", () => {
    const md = jsonToMarkdown(
      doc(
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                p(text("one")),
                { type: "orderedList", content: [{ type: "listItem", content: [p(text("sub"))] }] },
              ],
            },
          ],
        },
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [p(text("done"))] },
            { type: "taskItem", attrs: { checked: false }, content: [p(text("todo"))] },
          ],
        },
      ),
    );
    expect(md).toBe(
      "- one\n\n  1. sub\n\n- [x] done\n- [ ] todo\n"
        .replace("\n\n  1.", "\n  1.")
        .replace("sub\n\n-", "sub\n\n-"),
    );
  });

  it("renders tables as GFM and code blocks fenced", () => {
    const cell = (t: string, type = "tableCell"): JSONContent => ({ type, content: [p(text(t))] });
    const md = jsonToMarkdown(
      doc(
        {
          type: "table",
          content: [
            { type: "tableRow", content: [cell("A", "tableHeader"), cell("B", "tableHeader")] },
            { type: "tableRow", content: [cell("1"), cell("a|b")] },
          ],
        },
        { type: "codeBlock", attrs: { language: "ts" }, content: [text("const x = 1;")] },
      ),
    );
    expect(md).toBe("| A | B |\n| --- | --- |\n| 1 | a\\|b |\n\n```ts\nconst x = 1;\n```\n");
  });

  it("links attachments by the path given by the exporter, images inline", () => {
    const embed = (name: string, mime: string): JSONContent => ({
      type: "fileEmbed",
      attrs: { attachmentId: `id-${name}`, name, mime, size: 1 },
    });
    const md = jsonToMarkdown(
      doc(embed("my photo.png", "image/png"), embed("spec.pdf", "application/pdf")),
      {
        attachmentPath: ({ name }) => `attachments/${name}`,
      },
    );
    expect(md).toBe(
      "![my photo.png](attachments/my%20photo.png)\n\n[spec.pdf](attachments/spec.pdf)\n",
    );
  });

  it("renders mentions and degrades colors, highlights and author marks to plain text", () => {
    const md = jsonToMarkdown(
      doc(
        p(
          { type: "mention", attrs: { id: "u1", label: "Anna" } },
          text(" see "),
          text("red", [{ type: "textStyle", attrs: { color: "#f00" } }, { type: "highlight" }]),
          text("x", [{ type: "ychange", attrs: { user: "u" } }]),
        ),
      ),
    );
    expect(md).toBe("@Anna see redx\n");
  });

  it("renders an empty note as a single newline", () => {
    expect(jsonToMarkdown(null)).toBe("\n");
  });
});
