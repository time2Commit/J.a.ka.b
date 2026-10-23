"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { FolderTree, useFolders } from "@/features/folders/folder-tree";
import { NewItemDialog } from "@/features/folders/new-item-dialog";
import type { TreeItem } from "@/features/folders/tree";
import { useTreeCrud } from "@/features/folders/use-tree-crud";
import { api } from "@/lib/api";
import type { TemplateItem } from "@/lib/types";
import { templatesKey } from "./keys";

export function useTemplateList() {
  return useQuery({
    queryKey: templatesKey,
    queryFn: () => api<TemplateItem[]>("/api/templates"),
  });
}

/** The tree of the templates: open one to edit it, create templates and folders, move, delete. */
export function TemplatesTree() {
  const t = useTranslations("Templates.tree");
  const templates = useTemplateList();
  const folders = useFolders("template");
  const { creating, startCreating, stopCreating, create, deleteItem } = useTreeCrud<{
    name: string;
    folderId: string | null;
  }>({
    namespace: "Templates.tree",
    apiPath: "/api/templates",
    basePath: "/templates",
    queryRoot: "templates",
  });

  const items: TreeItem[] = useMemo(
    () =>
      (templates.data ?? []).map((tpl) => ({
        id: tpl.id,
        name: tpl.name,
        folderId: tpl.folderId,
        lastModified: tpl.updatedAt,
      })),
    [templates.data],
  );

  return (
    <>
      <FolderTree
        kind="template"
        items={items}
        loading={templates.isLoading}
        basePath="/templates"
        moveItem={(id, folderId) =>
          api(`/api/templates/${id}`, { method: "PATCH", json: { folderId } })
        }
        onNewItem={startCreating}
        deleteItem={deleteItem}
      />
      <NewItemDialog
        open={creating !== null}
        title={t("newItem")}
        namespace="Templates.tree"
        folders={folders.data ?? []}
        initialFolderId={creating?.folderId ?? null}
        pending={create.isPending}
        onClose={stopCreating}
        onSubmit={({ name, folderId }) => create.mutate({ name, folderId })}
      />
    </>
  );
}
