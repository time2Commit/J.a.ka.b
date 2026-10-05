import type { JSONContent } from "@tiptap/core";
import { fileKind } from "./files";

export interface MarkdownOptions {
  /** Path (relative to the .md file) where an attachment's bytes are stored in an export. */
  attachmentPath?: (embed: { attachmentId: string; name: string }) => string | null;
}

type Mark = NonNullable<JSONContent["marks"]>[number];

const escapeText = (text: string) => text.replace(/([\\`*_[\]<>~|])/g, "\\$1");
const escapeLinkText = (text: string) => text.replace(/([\\[\]])/g, "\\$1");
const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

function inlineText(node: JSONContent): string {
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "mention")
    return `@${escapeText(String(node.attrs?.label ?? node.attrs?.id ?? ""))}`;
  if (node.type !== "text") return (node.content ?? []).map(inlineText).join("");

  const raw = node.text ?? "";
  const marks: Mark[] = (node.marks ?? []).filter((m) => m.type !== "ychange");
  if (marks.some((m) => m.type === "code")) {
    const fence = raw.includes("`") ? "`` " : "`";
    return `${fence}${raw}${fence.trim() === "``" ? " ``" : "`"}`;
  }
  let out = escapeText(raw);
  // Surrounding spaces must stay outside the emphasis markers or the Markdown is invalid.
  const [, lead = "", body = "", trail = ""] = /^(\s*)([\s\S]*?)(\s*)$/.exec(out) ?? [];
  out = body;
  if (out === "") return raw;
  for (const mark of marks) {
    if (mark.type === "bold") out = `**${out}**`;
    else if (mark.type === "italic") out = `*${out}*`;
    else if (mark.type === "strike") out = `~~${out}~~`;
    else if (mark.type === "link" && mark.attrs?.href) {
      out = `[${out.replace(/([\\[\]])/g, "\\$1")}](${String(mark.attrs.href).replace(/[()\s]/g, encodeURIComponent)})`;
    }
    // Text colors and highlights have no Markdown equivalent: they degrade to plain text.
  }
  return `${lead}${out}${trail}`;
}

const inline = (node: JSONContent) => (node.content ?? []).map(inlineText).join("");

function tableRows(table: JSONContent) {
  return (table.content ?? []).map((row) =>
    (row.content ?? []).map((cell) =>
      (cell.content ?? [])
        .map((block) => inline(block))
        .filter(Boolean)
        .join("<br>"),
    ),
  );
}

function renderTable(table: JSONContent): string {
  const rows = tableRows(table);
  if (rows.length === 0) return "";
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (r: string[]) => [...r, ...Array<string>(width - r.length).fill("")];
  const line = (r: string[]) => `| ${pad(r).join(" | ")} |`;
  return [line(rows[0]!), line(Array<string>(width).fill("---")), ...rows.slice(1).map(line)].join(
    "\n",
  );
}

const indent = (text: string, prefix: string, first: string) =>
  text
    .split("\n")
    .map((l, i) => (l === "" ? "" : `${i === 0 ? first : prefix}${l}`))
    .join("\n");

function renderBlock(node: JSONContent, options: MarkdownOptions): string {
  const children = (parts = node.content ?? [], separator = "\n\n") =>
    parts
      .map((c) => renderBlock(c, options))
      .filter((s) => s !== "")
      .join(separator);

  switch (node.type) {
    case "paragraph":
      return inline(node);
    case "heading":
      return `${"#".repeat(Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1))))} ${inline(node)}`;
    case "blockquote":
      return indent(children(), "> ", "> ");
    case "codeBlock": {
      const code = (node.content ?? []).map((c) => c.text ?? "").join("");
      const fence = code.includes("```") ? "~~~~" : "```";
      return `${fence}${node.attrs?.language ?? ""}\n${code}\n${fence}`;
    }
    case "horizontalRule":
      return "---";
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const start = Number(node.attrs?.start ?? 1);
      return (node.content ?? [])
        .map((item, i) => {
          // Tight lists: an item's paragraph and its nested list stay on consecutive lines.
          const body = children(item.content, "\n");
          const marker =
            node.type === "orderedList"
              ? `${start + i}. `
              : node.type === "taskList"
                ? `- [${item.attrs?.checked ? "x" : " "}] `
                : "- ";
          return indent(body, " ".repeat(marker.length), marker);
        })
        .join("\n");
    }
    case "table":
      return renderTable(node);
    case "fileEmbed": {
      const { attachmentId, name } = (node.attrs ?? {}) as { attachmentId: string; name: string };
      const target = options.attachmentPath?.({ attachmentId, name });
      const label = escapeLinkText(name || "file");
      if (!target) return label;
      const href = encodePath(target);
      return fileKind(String(node.attrs?.mime)) === "image"
        ? `![${label}](${href})`
        : `[${label}](${href})`;
    }
    default:
      // Unknown node: keep its text rather than dropping content silently.
      return node.content ? children() : inline(node);
  }
}

/** GFM Markdown for a note (tables, checklists, code; colors and highlights degrade to plain text). */
export function jsonToMarkdown(
  json: JSONContent | null | undefined,
  options: MarkdownOptions = {},
) {
  const blocks = (json?.content ?? []).map((n) => renderBlock(n, options));
  return (
    blocks
      .join("\n\n")
      .replace(/\n{3,}/g, "\n\n")
      .trimEnd() + "\n"
  );
}
