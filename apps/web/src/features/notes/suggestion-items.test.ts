import { describe, expect, it } from "vitest";
import { filterMentions, filterSlashItems, MENTION_LIMIT } from "./suggestion-items";

const people = [
  { id: "1", name: "Anna Bianchi", color: "#111" },
  { id: "2", name: "Luca Rossi", color: "#222" },
  { id: "3", name: "Joanna Verdi", color: "#333" },
  { id: "4", name: "Àlvaro Neri", color: "#444" },
];

describe("filterMentions", () => {
  it("matches the start of any word first, then text contained in the name", () => {
    expect(filterMentions(people, "ann").map((p) => p.name)).toEqual([
      "Anna Bianchi",
      "Joanna Verdi",
    ]);
    expect(filterMentions(people, "bia").map((p) => p.name)).toEqual(["Anna Bianchi"]);
  });
  it("ignores case and accents and lists everybody for an empty query", () => {
    expect(filterMentions(people, "ALVARO").map((p) => p.id)).toEqual(["4"]);
    expect(filterMentions(people, "")).toHaveLength(4);
  });
  it("limits the number of results", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      name: `User ${i}`,
      color: "#000",
    }));
    expect(filterMentions(many, "user")).toHaveLength(MENTION_LIMIT);
  });
});

describe("filterSlashItems", () => {
  const items = [
    { id: "h1", label: "Heading 1", keywords: ["title", "titolo"] },
    { id: "list", label: "Bullet list", keywords: ["elenco"] },
    { id: "table", label: "Tabella", keywords: ["table"] },
  ];
  it("matches labels and keywords in any language", () => {
    expect(filterSlashItems(items, "head").map((i) => i.id)).toEqual(["h1"]);
    expect(filterSlashItems(items, "titolo").map((i) => i.id)).toEqual(["h1"]);
    expect(filterSlashItems(items, "TABLE").map((i) => i.id)).toEqual(["table"]);
    expect(filterSlashItems(items, "zzz")).toEqual([]);
  });
  it("lists everything for an empty query", () => {
    expect(filterSlashItems(items, "")).toHaveLength(3);
  });
});
