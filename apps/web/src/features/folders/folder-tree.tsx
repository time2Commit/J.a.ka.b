"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PROJECT_SORTS, type FolderKind, type ProjectSort } from "@jakab/shared";
import {
  ChevronRight,
  FileStack,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { Folder, Meta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FolderNameDialog, MoveDialog } from "./folder-dialogs";
import { buildTree, folderAndDescendants, type FolderNode, type TreeItem } from "./tree";

const OPEN_KEY = "jakab.tree.open";

type Dragged = { type: "item" | "folder"; id: string };
type Dialog =
  | { kind: "create"; parentId: string | null }
  | { kind: "rename"; folder: Folder }
  | { kind: "move"; type: "item" | "folder"; id: string; name: string; from: string | null }
  | null;

/** A menu entry, shown in the "⋯" menu and in the right-click menu of the same row. */
interface Action {
  key: string;
  label: string;
  onSelect: () => void;
  danger?: boolean;
  /** A separator goes above this entry. */
  separated?: boolean;
}

const ROOT = { project: "projects", template: "templates" } as const;

/** The folders of one tree (projects or templates). */
export function useFolders(kind: FolderKind) {
  return useQuery({
    queryKey: [ROOT[kind], "folders"],
    queryFn: () => api<Folder[]>(`/api/folders?kind=${kind}`),
  });
}

function readOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/**
 * A tree of folders holding projects or templates: create, rename, move (drag or menu), delete,
 * sort. Folder actions are in the "⋯" menu and in the right-click menu of every row; right-clicking
 * the empty space offers "new folder" and "new item".
 */
export function FolderTree({
  kind,
  items,
  loading,
  basePath,
  moveItem,
  onNewItem,
  deleteItem,
}: {
  kind: FolderKind;
  items: TreeItem[];
  loading: boolean;
  /** "/projects" or "/templates": the open item is read from the address. */
  basePath: string;
  moveItem: (id: string, folderId: string | null) => Promise<unknown>;
  /** Asks for the details of a new item (in a folder, or at the top level). */
  onNewItem: (folderId: string | null) => void;
  deleteItem: (item: TreeItem) => void;
}) {
  const namespace = kind === "project" ? "Projects.tree" : "Templates.tree";
  const t = useTranslations(namespace);
  const common = useTranslations("Common");
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const folders = useFolders(kind);
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });
  const ItemIcon = kind === "project" ? FileText : FileStack;

  const sort: ProjectSort = meta.data?.preferences.projectSort ?? "name";
  const folderList = useMemo(() => folders.data ?? [], [folders.data]);
  const tree = useMemo(() => buildTree(folderList, items, sort), [folderList, items, sort]);
  const activeId = new RegExp(`^${basePath}/([^/]+)`).exec(pathname)?.[1] ?? null;

  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => setOpen(readOpen()), []);
  function setOpenState(next: Set<string>) {
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
    } catch {
      // The tree works without remembering what is open.
    }
  }
  const toggle = (id: string) => {
    const next = new Set(open);
    if (!next.delete(id)) next.add(id);
    setOpenState(next);
  };

  // The folders that hold the item being read are opened, so it is visible in the tree.
  const activeFolderId = items.find((i) => i.id === activeId)?.folderId ?? null;
  useEffect(() => {
    if (!activeFolderId || folderList.length === 0) return;
    const parents = new Map(folderList.map((f) => [f.id, f.parentId]));
    const missing: string[] = [];
    for (let id: string | null = activeFolderId; id; id = parents.get(id) ?? null) {
      if (!open.has(id)) missing.push(id);
    }
    if (missing.length > 0) setOpenState(new Set([...open, ...missing]));
    // Only when the item or the folders change, not each time something is toggled.
  }, [activeFolderId, folderList]);

  /** Opens a folder and the ones above it, so what was put there is in view. */
  function reveal(folderId: string | null) {
    if (!folderId) return;
    const parents = new Map(folderList.map((f) => [f.id, f.parentId]));
    const next = new Set(open);
    for (let id: string | null = folderId; id; id = parents.get(id) ?? null) next.add(id);
    setOpenState(next);
  }

  const [dialog, setDialog] = useState<Dialog>(null);
  const [dropTarget, setDropTarget] = useState<string | "top" | null>(null);
  const dragged = useRef<Dragged | null>(null);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: [ROOT[kind]] });
  const onError = (error: unknown) =>
    toast.error(
      error instanceof ApiError && error.status === 409 ? error.message : common("error"),
    );

  const createFolder = useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) =>
      api<Folder>("/api/folders", { method: "POST", json: { kind, ...input } }),
    onSuccess: (folder) => {
      setDialog(null);
      reveal(folder.parentId);
      refresh();
    },
    onError,
  });
  const updateFolder = useMutation({
    mutationFn: ({ id, ...json }: { id: string; name?: string; parentId?: string | null }) =>
      api(`/api/folders/${id}`, { method: "PATCH", json }),
    onSuccess: () => {
      setDialog(null);
      refresh();
    },
    onError,
  });
  const deleteFolder = useMutation({
    mutationFn: (id: string) => api(`/api/folders/${id}`, { method: "DELETE" }),
    onSuccess: refresh,
    onError,
  });
  const move = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      moveItem(id, folderId),
    onSuccess: () => {
      setDialog(null);
      refresh();
    },
    onError,
  });
  const savePreference = useMutation({
    mutationFn: (projectSort: ProjectSort) =>
      api("/api/me/preferences", { method: "PATCH", json: { projectSort } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["meta"] }),
  });

  /** Puts an item or a folder into `folderId` (null = top level / uncategorized). */
  function moveTo(what: Dragged, folderId: string | null) {
    reveal(folderId);
    if (what.type === "item") {
      const current = items.find((i) => i.id === what.id)?.folderId ?? null;
      if (current !== folderId) move.mutate({ id: what.id, folderId });
      else setDialog(null);
      return;
    }
    const current = folderList.find((f) => f.id === what.id)?.parentId ?? null;
    if (folderId !== null && folderAndDescendants(folderList, what.id).has(folderId)) return;
    if (current !== folderId) updateFolder.mutate({ id: what.id, parentId: folderId });
    else setDialog(null);
  }

  const dragProps = (what: Dragged) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragged.current = what;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", what.id);
    },
    onDragEnd: () => {
      dragged.current = null;
      setDropTarget(null);
    },
  });
  /** Whether what is being dragged may be dropped on this folder (null = top level). */
  const canDrop = (folderId: string | null) => {
    const what = dragged.current;
    if (!what) return false;
    return !(
      what.type === "folder" &&
      folderId !== null &&
      folderAndDescendants(folderList, what.id).has(folderId)
    );
  };
  const dropProps = (folderId: string | null, key: string | "top") => ({
    onDragOver: (e: React.DragEvent) => {
      if (!canDrop(folderId)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (dropTarget !== key) setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((current) => (current === key ? null : current)),
    onDrop: (e: React.DragEvent) => {
      const what = dragged.current;
      setDropTarget(null);
      if (!what || !canDrop(folderId)) return;
      e.preventDefault();
      e.stopPropagation();
      dragged.current = null;
      moveTo(what, folderId);
    },
  });

  // The entries of each kind of row, used by both menus.
  const folderActions = (folder: Folder): Action[] => [
    {
      key: "sub",
      label: t("newSubfolder"),
      onSelect: () => setDialog({ kind: "create", parentId: folder.id }),
    },
    { key: "item", label: t("newItemHere"), onSelect: () => onNewItem(folder.id) },
    { key: "rename", label: t("rename"), onSelect: () => setDialog({ kind: "rename", folder }) },
    {
      key: "move",
      label: t("moveTo"),
      onSelect: () =>
        setDialog({
          kind: "move",
          type: "folder",
          id: folder.id,
          name: folder.name,
          from: folder.parentId,
        }),
    },
    {
      key: "delete",
      label: t("deleteFolder"),
      danger: true,
      separated: true,
      onSelect: () => {
        if (window.confirm(t("deleteConfirm", { name: folder.name })))
          deleteFolder.mutate(folder.id);
      },
    },
  ];
  const itemActions = (item: TreeItem): Action[] => [
    {
      key: "move",
      label: t("moveTo"),
      onSelect: () =>
        setDialog({
          kind: "move",
          type: "item",
          id: item.id,
          name: item.name,
          from: item.folderId,
        }),
    },
    {
      key: "delete",
      label: t("deleteItem"),
      danger: true,
      separated: true,
      onSelect: () => deleteItem(item),
    },
  ];
  const spaceActions = (): Action[] => [
    {
      key: "folder",
      label: t("newFolder"),
      onSelect: () => setDialog({ kind: "create", parentId: null }),
    },
    { key: "item", label: t("newItem"), onSelect: () => onNewItem(null) },
  ];

  function dropdown(label: string, actions: Action[]) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={label}
          className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-40 outline-none group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:opacity-100 max-md:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((a) => (
            <div key={a.key}>
              {a.separated && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className={a.danger ? "text-destructive focus:text-destructive" : undefined}
                onSelect={a.onSelect}
              >
                {a.label}
              </DropdownMenuItem>
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  /** Wraps a row so that right-clicking it opens its actions. */
  function withContextMenu(row: React.ReactNode, actions: Action[]) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
          {row}
        </ContextMenuTrigger>
        <ContextMenuContent>
          {actions.map((a) => (
            <div key={a.key}>
              {a.separated && <ContextMenuSeparator />}
              <ContextMenuItem
                className={a.danger ? "text-destructive focus:text-destructive" : undefined}
                onSelect={a.onSelect}
              >
                {a.label}
              </ContextMenuItem>
            </div>
          ))}
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  // These are plain render functions, not components: a component declared here would be a new
  // type on every render and lose its open menu and focus each time the tree refreshes.
  function renderItem(item: TreeItem, depth: number) {
    const active = item.id === activeId;
    const actions = itemActions(item);
    return (
      <li key={item.id} role="treeitem" aria-selected={active}>
        {withContextMenu(
          <div
            {...dragProps({ type: "item", id: item.id })}
            {...dropProps(item.folderId, item.folderId ?? "top")}
            style={{ paddingLeft: `${0.25 + depth * 0.9}rem` }}
            className={cn(
              "group flex items-center gap-1.5 rounded-md py-1 pr-1 text-sm",
              active ? "bg-accent font-medium" : "hover:bg-accent/50",
            )}
          >
            <span className="size-4 shrink-0" aria-hidden />
            <Link
              href={`${basePath}/${item.id}`}
              aria-current={active ? "page" : undefined}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ItemIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.dot && (
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.dot.color }}
                  title={item.dot.title}
                />
              )}
            </Link>
            {dropdown(t("actionsFor", { name: item.name }), actions)}
          </div>,
          actions,
        )}
      </li>
    );
  }

  function renderFolder(node: FolderNode, depth: number) {
    const { folder } = node;
    const isOpen = open.has(folder.id);
    const Icon = isOpen ? FolderOpen : FolderIcon;
    const actions = folderActions(folder);
    return (
      <li key={folder.id} role="treeitem" aria-expanded={isOpen}>
        {withContextMenu(
          <div
            {...dragProps({ type: "folder", id: folder.id })}
            {...dropProps(folder.id, folder.id)}
            style={{ paddingLeft: `${0.25 + depth * 0.9}rem` }}
            className={cn(
              "group flex items-center gap-1.5 rounded-md py-1 pr-1 text-sm hover:bg-accent/50",
              dropTarget === folder.id && "bg-accent ring-2 ring-ring/50",
            )}
          >
            <button
              type="button"
              onClick={() => toggle(folder.id)}
              aria-label={t(isOpen ? "collapse" : "expand", { name: folder.name })}
              className="flex size-4 shrink-0 items-center justify-center rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ChevronRight className={cn("size-4 transition-transform", isOpen && "rotate-90")} />
            </button>
            <button
              type="button"
              onClick={() => toggle(folder.id)}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{node.count}</span>
            </button>
            {dropdown(t("actionsFor", { name: folder.name }), actions)}
          </div>,
          actions,
        )}
        {isOpen && (
          <ul role="group">
            {node.children.map((child) => renderFolder(child, depth + 1))}
            {node.items.map((item) => renderItem(item, depth + 1))}
            {node.count === 0 && (
              <li
                className="py-1 text-xs text-muted-foreground"
                style={{ paddingLeft: `${0.25 + (depth + 1) * 0.9 + 1.5}rem` }}
              >
                {t("emptyFolder")}
              </li>
            )}
          </ul>
        )}
      </li>
    );
  }

  const busy = loading || folders.isLoading;
  const moving = dialog?.kind === "move" ? dialog : null;
  const hasFolders = tree.folders.length > 0;
  const empty = items.length === 0 && !hasFolders;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onNewItem(null)}>
          <Plus /> {t("newItem")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialog({ kind: "create", parentId: null })}
        >
          <FolderPlus /> {t("newFolder")}
        </Button>
        <Select
          aria-label={t("sortBy")}
          value={sort}
          onChange={(e) => savePreference.mutate(e.target.value as ProjectSort)}
          className="h-8 w-full"
        >
          {PROJECT_SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      {busy ? (
        <p className="text-sm text-muted-foreground">{common("loading")}</p>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              className={cn("min-h-24 rounded-md", dropTarget === "top" && "ring-2 ring-ring/50")}
              {...dropProps(null, "top")}
            >
              {empty ? (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
              ) : (
                <ul role="tree" aria-label={t("label")} className="flex flex-col gap-0.5">
                  {tree.folders.map((node) => renderFolder(node, 0))}
                  {hasFolders && tree.uncategorized.length > 0 && (
                    <li
                      role="presentation"
                      className="mt-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
                    >
                      {t("uncategorized")}
                    </li>
                  )}
                  {tree.uncategorized.map((item) => renderItem(item, 0))}
                </ul>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {spaceActions().map((a) => (
              <ContextMenuItem key={a.key} onSelect={a.onSelect}>
                {a.label}
              </ContextMenuItem>
            ))}
          </ContextMenuContent>
        </ContextMenu>
      )}

      <FolderNameDialog
        open={dialog?.kind === "create" || dialog?.kind === "rename"}
        title={dialog?.kind === "rename" ? t("renameFolder") : t("newFolder")}
        initial={dialog?.kind === "rename" ? dialog.folder.name : ""}
        confirmLabel={dialog?.kind === "rename" ? common("save") : common("add")}
        pending={createFolder.isPending || updateFolder.isPending}
        onClose={() => setDialog(null)}
        namespace={namespace}
        onSubmit={(name) => {
          if (dialog?.kind === "rename") updateFolder.mutate({ id: dialog.folder.id, name });
          else if (dialog?.kind === "create")
            createFolder.mutate({ name, parentId: dialog.parentId });
        }}
      />
      <MoveDialog
        title={moving ? t("moveTitle", { name: moving.name }) : null}
        folders={tree.folders}
        disabledIds={
          moving?.type === "folder" ? folderAndDescendants(folderList, moving.id) : new Set()
        }
        currentId={moving?.from ?? null}
        pending={move.isPending || updateFolder.isPending}
        onClose={() => setDialog(null)}
        onPick={(folderId) => moving && moveTo({ type: moving.type, id: moving.id }, folderId)}
        namespace={namespace}
      />
    </div>
  );
}
