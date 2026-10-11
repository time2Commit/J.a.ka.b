"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PROJECT_SORTS, type ProjectSort } from "@jakab/shared";
import {
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { Folder, Meta, ProjectTreeItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FolderNameDialog, MoveDialog } from "./folder-dialogs";
import { buildTree, folderAndDescendants, type FolderNode } from "./tree";

const OPEN_KEY = "jakab.projectTree.open";

type Dragged = { type: "project" | "folder"; id: string };
type Dialog =
  | { kind: "create"; parentId: string | null }
  | { kind: "rename"; folder: Folder }
  | { kind: "move"; type: "project" | "folder"; id: string; name: string; from: string | null }
  | null;

/** Query keys: under "projects" so that board events refresh them with everything else. */
export const TREE_KEYS = {
  projects: ["projects", "tree"],
  folders: ["projects", "folders"],
} as const;

export function useProjectTreeData() {
  const projects = useQuery({
    queryKey: TREE_KEYS.projects,
    queryFn: () => api<ProjectTreeItem[]>("/api/projects"),
  });
  const folders = useQuery({
    queryKey: TREE_KEYS.folders,
    queryFn: () => api<Folder[]>("/api/folders"),
  });
  return { projects, folders };
}

function readOpen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** The tree of folders and projects: create, rename, move (drag or menu), delete, sort. */
export function ProjectsTree() {
  const t = useTranslations("Projects.tree");
  const common = useTranslations("Common");
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { projects, folders } = useProjectTreeData();
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });

  const sort: ProjectSort = meta.data?.preferences.projectSort ?? "name";
  const statuses = meta.data?.statuses ?? [];
  const folderList = useMemo(() => folders.data ?? [], [folders.data]);
  const tree = useMemo(
    () => buildTree(folderList, projects.data ?? [], sort),
    [folderList, projects.data, sort],
  );
  const activeId = /^\/projects\/([^/]+)/.exec(pathname)?.[1] ?? null;

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

  // The folders that hold the project being read are opened, so it is visible in the tree.
  const activeFolderId = projects.data?.find((p) => p.id === activeId)?.folderId ?? null;
  useEffect(() => {
    if (!activeFolderId || folderList.length === 0) return;
    const parents = new Map(folderList.map((f) => [f.id, f.parentId]));
    const missing: string[] = [];
    for (let id: string | null = activeFolderId; id; id = parents.get(id) ?? null) {
      if (!open.has(id)) missing.push(id);
    }
    if (missing.length > 0) setOpenState(new Set([...open, ...missing]));
    // Only when the project or the folders change, not each time something is toggled.
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

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["projects"] });
  const onError = (error: unknown) =>
    toast.error(
      error instanceof ApiError && error.status === 409 ? error.message : common("error"),
    );

  const createFolder = useMutation({
    mutationFn: (input: { name: string; parentId: string | null }) =>
      api<Folder>("/api/folders", { method: "POST", json: input }),
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
  const moveProject = useMutation({
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) =>
      api(`/api/projects/${id}`, { method: "PATCH", json: { folderId } }),
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

  /** Puts a project or folder into `folderId` (null = top level / uncategorized). */
  function moveTo(item: Dragged, folderId: string | null) {
    reveal(folderId);
    if (item.type === "project") {
      const current = projects.data?.find((p) => p.id === item.id)?.folderId ?? null;
      if (current !== folderId) moveProject.mutate({ id: item.id, folderId });
      else setDialog(null);
      return;
    }
    const current = folderList.find((f) => f.id === item.id)?.parentId ?? null;
    if (folderId !== null && folderAndDescendants(folderList, item.id).has(folderId)) return;
    if (current !== folderId) updateFolder.mutate({ id: item.id, parentId: folderId });
    else setDialog(null);
  }

  const dragProps = (item: Dragged) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      dragged.current = item;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.id);
    },
    onDragEnd: () => {
      dragged.current = null;
      setDropTarget(null);
    },
  });
  /** Whether what is being dragged may be dropped on this folder (null = top level). */
  const canDrop = (folderId: string | null) => {
    const item = dragged.current;
    if (!item) return false;
    return !(
      item.type === "folder" &&
      folderId !== null &&
      folderAndDescendants(folderList, item.id).has(folderId)
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
      const item = dragged.current;
      setDropTarget(null);
      if (!item || !canDrop(folderId)) return;
      e.preventDefault();
      e.stopPropagation();
      dragged.current = null;
      moveTo(item, folderId);
    },
  });

  // These are plain render functions, not components: a component declared here would be a new
  // type on every render and lose its open menu and focus each time the tree refreshes.
  function rowMenu(label: string, children: React.ReactNode) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={label}
          className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:opacity-100 max-md:opacity-100"
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{children}</DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function renderProject(project: ProjectTreeItem, depth: number) {
    const status = statuses.find((s) => s.id === project.statusId);
    const active = project.id === activeId;
    return (
      <li key={project.id} role="treeitem" aria-selected={active}>
        <div
          {...dragProps({ type: "project", id: project.id })}
          {...dropProps(project.folderId, project.folderId ?? "top")}
          style={{ paddingLeft: `${0.25 + depth * 0.9}rem` }}
          className={cn(
            "group flex items-center gap-1.5 rounded-md py-1 pr-1 text-sm",
            active ? "bg-accent font-medium" : "hover:bg-accent/50",
          )}
        >
          <span className="size-4 shrink-0" aria-hidden />
          <Link
            href={`/projects/${project.id}`}
            aria-current={active ? "page" : undefined}
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {status && (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: status.color }}
                title={status.name}
              />
            )}
          </Link>
          {rowMenu(
            t("actionsFor", { name: project.name }),
            <DropdownMenuItem
              onSelect={() =>
                setDialog({
                  kind: "move",
                  type: "project",
                  id: project.id,
                  name: project.name,
                  from: project.folderId,
                })
              }
            >
              {t("moveTo")}
            </DropdownMenuItem>,
          )}
        </div>
      </li>
    );
  }

  function renderFolder(node: FolderNode, depth: number) {
    const { folder } = node;
    const isOpen = open.has(folder.id);
    const Icon = isOpen ? FolderOpen : FolderIcon;
    return (
      <li key={folder.id} role="treeitem" aria-expanded={isOpen}>
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
          {rowMenu(
            t("actionsFor", { name: folder.name }),
            <>
              <DropdownMenuItem onSelect={() => setDialog({ kind: "create", parentId: folder.id })}>
                {t("newSubfolder")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog({ kind: "rename", folder })}>
                {t("rename")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  setDialog({
                    kind: "move",
                    type: "folder",
                    id: folder.id,
                    name: folder.name,
                    from: folder.parentId,
                  })
                }
              >
                {t("moveTo")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => {
                  if (window.confirm(t("deleteConfirm", { name: folder.name }))) {
                    deleteFolder.mutate(folder.id);
                  }
                }}
              >
                {t("deleteFolder")}
              </DropdownMenuItem>
            </>,
          )}
        </div>
        {isOpen && (
          <ul role="group">
            {node.children.map((child) => renderFolder(child, depth + 1))}
            {node.projects.map((p) => renderProject(p, depth + 1))}
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

  const loading = projects.isLoading || folders.isLoading;
  const moving = dialog?.kind === "move" ? dialog : null;
  const hasFolders = tree.folders.length > 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
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
          className="h-8 min-w-0 flex-1"
        >
          {PROJECT_SORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sort.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{common("loading")}</p>
      ) : (projects.data?.length ?? 0) === 0 && !hasFolders ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul
          role="tree"
          aria-label={t("label")}
          className={cn(
            "flex min-h-24 flex-col gap-0.5 rounded-md",
            dropTarget === "top" && "ring-2 ring-ring/50",
          )}
          {...dropProps(null, "top")}
        >
          {tree.folders.map((node) => renderFolder(node, 0))}
          {hasFolders && tree.uncategorized.length > 0 && (
            <li
              role="presentation"
              className="mt-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
            >
              {t("uncategorized")}
            </li>
          )}
          {tree.uncategorized.map((p) => renderProject(p, 0))}
        </ul>
      )}

      <FolderNameDialog
        open={dialog?.kind === "create" || dialog?.kind === "rename"}
        title={dialog?.kind === "rename" ? t("renameFolder") : t("newFolder")}
        initial={dialog?.kind === "rename" ? dialog.folder.name : ""}
        confirmLabel={dialog?.kind === "rename" ? common("save") : common("add")}
        pending={createFolder.isPending || updateFolder.isPending}
        onClose={() => setDialog(null)}
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
        pending={moveProject.isPending || updateFolder.isPending}
        onClose={() => setDialog(null)}
        onPick={(folderId) => moving && moveTo({ type: moving.type, id: moving.id }, folderId)}
      />
    </div>
  );
}
