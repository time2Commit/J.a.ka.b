import type { ProjectSort } from "@jakab/shared";
import type { Folder } from "@/lib/types";

/** Whatever a tree holds: a project or a template. */
export interface TreeItem {
  id: string;
  name: string;
  folderId: string | null;
  /** Latest change (ISO date), for ordering. */
  lastModified: string;
  /** A small coloured dot after the name (the status of a project), with its tooltip. */
  dot?: { color: string; title: string } | null;
}

export interface FolderNode {
  folder: Folder;
  children: FolderNode[];
  items: TreeItem[];
  /** Items in this folder and all of its subfolders. */
  count: number;
  /** Most recent change inside this folder (ms since epoch; 0 when it is empty). */
  modified: number;
}

export interface ProjectTree {
  folders: FolderNode[];
  /** Items that are in no folder. */
  uncategorized: TreeItem[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Builds the tree and orders every level: by name, or the most recently changed first. */
export function buildTree(folders: Folder[], items: TreeItem[], sort: ProjectSort): ProjectTree {
  const nodes = new Map<string, FolderNode>(
    folders.map((folder) => [
      folder.id,
      { folder, children: [], items: [], count: 0, modified: 0 },
    ]),
  );
  const top: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.folder.parentId ? nodes.get(node.folder.parentId) : undefined;
    // A folder whose parent is missing is shown at the top rather than lost.
    (parent ?? { children: top }).children.push(node);
  }
  const uncategorized: TreeItem[] = [];
  for (const item of items) {
    const node = item.folderId ? nodes.get(item.folderId) : undefined;
    (node ? node.items : uncategorized).push(item);
  }

  const time = (p: TreeItem) => Date.parse(p.lastModified) || 0;
  const byItem = (a: TreeItem, b: TreeItem) =>
    sort === "modified"
      ? time(b) - time(a) || collator.compare(a.name, b.name)
      : collator.compare(a.name, b.name);
  const byFolder = (a: FolderNode, b: FolderNode) =>
    sort === "modified"
      ? b.modified - a.modified || collator.compare(a.folder.name, b.folder.name)
      : collator.compare(a.folder.name, b.folder.name);

  const finish = (node: FolderNode, seen: Set<string>): void => {
    seen.add(node.folder.id);
    node.children = node.children.filter((c) => !seen.has(c.folder.id));
    for (const child of node.children) finish(child, seen);
    node.count = node.items.length + node.children.reduce((n, c) => n + c.count, 0);
    node.modified = Math.max(0, ...node.items.map(time), ...node.children.map((c) => c.modified));
    node.items.sort(byItem);
    node.children.sort(byFolder);
  };
  const seen = new Set<string>();
  for (const node of top) finish(node, seen);
  top.sort(byFolder);
  uncategorized.sort(byItem);
  return { folders: top, uncategorized };
}

/** Ids of a folder and everything below it: the places it cannot be moved into. */
export function folderAndDescendants(folders: Folder[], id: string): Set<string> {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id);
        grew = true;
      }
    }
  }
  return result;
}

/** Names from the top of the tree down to the folder ([] for a missing one). */
export function folderPathNames(folders: Folder[], id: string | null): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: string[] = [];
  const seen = new Set<string>();
  for (let f = id ? byId.get(id) : undefined; f && !seen.has(f.id);) {
    seen.add(f.id);
    path.unshift(f.name);
    f = f.parentId ? byId.get(f.parentId) : undefined;
  }
  return path;
}

/** The folders in display order, with their depth, for pickers (a "Move to…" list). */
export function flattenFolders(
  nodes: FolderNode[],
  depth = 0,
): { folder: Folder; depth: number }[] {
  return nodes.flatMap((n) => [
    { folder: n.folder, depth },
    ...flattenFolders(n.children, depth + 1),
  ]);
}
