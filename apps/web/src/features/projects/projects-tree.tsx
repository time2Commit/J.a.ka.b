"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { FolderTree, useFolders } from "@/features/folders/folder-tree";
import { NewItemDialog } from "@/features/folders/new-item-dialog";
import type { TreeItem } from "@/features/folders/tree";
import { useTreeCrud } from "@/features/folders/use-tree-crud";
import { templatesKey } from "@/features/templates/keys";
import { api } from "@/lib/api";
import type { Meta, ProjectTreeItem, TemplateItem } from "@/lib/types";

/** The projects of the tree, as the overview and the tree itself read them. */
export function useProjectTreeData() {
  return useQuery({
    queryKey: ["projects", "tree"],
    queryFn: () => api<ProjectTreeItem[]>("/api/projects"),
  });
}

/** The tree of the projects: open a note, create projects and folders, move and delete them. */
export function ProjectsTree() {
  const t = useTranslations("Projects.tree");
  const projects = useProjectTreeData();
  const folders = useFolders("project");
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });
  const templates = useQuery({
    queryKey: templatesKey,
    queryFn: () => api<TemplateItem[]>("/api/templates"),
  });
  const { creating, startCreating, stopCreating, create, deleteItem } = useTreeCrud<{
    name: string;
    folderId: string | null;
    templateId: string | null;
  }>({
    namespace: "Projects.tree",
    apiPath: "/api/projects",
    basePath: "/projects",
    queryRoot: "projects",
    alsoOnDelete: ["cards"],
    forbiddenOnDelete: true,
  });

  const items: TreeItem[] = useMemo(
    () =>
      (projects.data ?? []).map((p) => {
        const status = meta.data?.statuses.find((s) => s.id === p.statusId);
        return {
          id: p.id,
          name: p.name,
          folderId: p.folderId,
          lastModified: p.lastModified,
          dot: status ? { color: status.color, title: status.name } : null,
        };
      }),
    [projects.data, meta.data],
  );

  return (
    <>
      <FolderTree
        kind="project"
        items={items}
        loading={projects.isLoading}
        basePath="/projects"
        moveItem={(id, folderId) =>
          api(`/api/projects/${id}`, { method: "PATCH", json: { folderId } })
        }
        onNewItem={startCreating}
        deleteItem={deleteItem}
      />
      <NewItemDialog
        open={creating !== null}
        title={t("newItem")}
        namespace="Projects.tree"
        folders={folders.data ?? []}
        initialFolderId={creating?.folderId ?? null}
        templates={templates.data}
        pending={create.isPending}
        onClose={stopCreating}
        onSubmit={(values) => create.mutate(values)}
      />
    </>
  );
}
