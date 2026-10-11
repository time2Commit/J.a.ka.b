import { describe, expect, it } from "vitest";
import type { Folder } from "@/lib/types";
import {
  buildTree,
  type TreeItem,
  folderAndDescendants,
  folderPathNames,
  flattenFolders,
} from "./tree";

const folder = (id: string, name: string, parentId: string | null = null): Folder => ({
  id,
  name,
  parentId,
});
const project = (
  id: string,
  name: string,
  folderId: string | null,
  lastModified: string,
): TreeItem => ({
  id,
  name,
  folderId,
  lastModified,
});

const folders = [folder("f-b", "Beta"), folder("f-a", "Alpha"), folder("f-a1", "Sub", "f-a")];
const projects = [
  project("p1", "zebra", "f-a", "2026-01-03T00:00:00Z"),
  project("p2", "Apple", "f-a", "2026-01-01T00:00:00Z"),
  project("p3", "loose", null, "2026-01-02T00:00:00Z"),
  project("p4", "deep", "f-a1", "2026-02-01T00:00:00Z"),
  project("p5", "item 10", null, "2026-01-05T00:00:00Z"),
  project("p6", "item 2", null, "2026-01-04T00:00:00Z"),
];

describe("buildTree", () => {
  it("nests folders, keeps unfiled projects apart and counts what is below", () => {
    const tree = buildTree(folders, projects, "name");
    expect(tree.folders.map((f) => f.folder.name)).toEqual(["Alpha", "Beta"]);
    const alpha = tree.folders[0]!;
    expect(alpha.children.map((c) => c.folder.name)).toEqual(["Sub"]);
    expect(alpha.items.map((p) => p.name)).toEqual(["Apple", "zebra"]);
    expect(alpha.count).toBe(3);
    expect(tree.folders[1]!.count).toBe(0);
    expect(tree.uncategorized.map((p) => p.name)).toEqual(["item 2", "item 10", "loose"]);
  });

  it("orders by the latest change when asked, folders by their newest content", () => {
    const tree = buildTree(folders, projects, "modified");
    expect(tree.folders.map((f) => f.folder.name)).toEqual(["Alpha", "Beta"]);
    expect(tree.folders[0]!.items.map((p) => p.name)).toEqual(["zebra", "Apple"]);
    expect(tree.uncategorized.map((p) => p.name)).toEqual(["item 10", "item 2", "loose"]);
    expect(tree.folders[0]!.modified).toBe(Date.parse("2026-02-01T00:00:00Z"));
  });

  it("does not lose a folder whose parent is missing, nor loop on a cycle", () => {
    const odd = [folder("x", "Orphan", "gone"), folder("c1", "C1", "c2"), folder("c2", "C2", "c1")];
    const tree = buildTree(odd, [], "name");
    expect(tree.folders.map((f) => f.folder.name)).toEqual(["Orphan"]);
  });
});

describe("folder helpers", () => {
  it("finds a folder and everything below it", () => {
    expect([...folderAndDescendants(folders, "f-a")].sort()).toEqual(["f-a", "f-a1"]);
    expect([...folderAndDescendants(folders, "f-b")]).toEqual(["f-b"]);
  });

  it("builds the path of names and the indented list", () => {
    expect(folderPathNames(folders, "f-a1")).toEqual(["Alpha", "Sub"]);
    expect(folderPathNames(folders, null)).toEqual([]);
    const flat = flattenFolders(buildTree(folders, [], "name").folders);
    expect(flat.map((f) => `${f.depth}:${f.folder.name}`)).toEqual(["0:Alpha", "1:Sub", "0:Beta"]);
  });
});
