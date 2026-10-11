"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderTree, useFolders } from "@/features/folders/folder-tree";
import { NewItemDialog } from "@/features/folders/new-item-dialog";
import type { TreeItem } from "@/features/folders/tree";
import { api, ApiError } from "@/lib/api";
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
  const common = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const templates = useTemplateList();
  const folders = useFolders("template");
  const [creating, setCreating] = useState<{ folderId: string | null } | null>(null);

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

  const create = useMutation({
    mutationFn: (input: { name: string; folderId: string | null }) =>
      api<TemplateItem>("/api/templates", { method: "POST", json: input }),
    onSuccess: (template) => {
      setCreating(null);
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
      router.push(`/templates/${template.id}`);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 409 ? t("nameTaken") : common("error"),
      ),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/templates/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      toast.success(t("itemDeleted"));
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
      if (pathname.startsWith(`/templates/${id}`)) router.push("/templates");
    },
    onError: () => toast.error(common("error")),
  });

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
        onNewItem={(folderId) => setCreating({ folderId })}
        deleteItem={(item) => {
          if (window.confirm(t("deleteItemConfirm", { name: item.name }))) remove.mutate(item.id);
        }}
      />
      <NewItemDialog
        open={creating !== null}
        title={t("newItem")}
        namespace="Templates.tree"
        folders={folders.data ?? []}
        initialFolderId={creating?.folderId ?? null}
        pending={create.isPending}
        onClose={() => setCreating(null)}
        onSubmit={({ name, folderId }) => create.mutate({ name, folderId })}
      />
    </>
  );
}
