"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FolderTree, useFolders } from "@/features/folders/folder-tree";
import { NewItemDialog } from "@/features/folders/new-item-dialog";
import type { TreeItem } from "@/features/folders/tree";
import { templatesKey } from "@/features/templates/keys";
import { api, ApiError } from "@/lib/api";
import type { Meta, ProjectDto, ProjectTreeItem, TemplateItem } from "@/lib/types";
import { usePathname } from "next/navigation";

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
  const common = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const projects = useProjectTreeData();
  const folders = useFolders("project");
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });
  const templates = useQuery({
    queryKey: templatesKey,
    queryFn: () => api<TemplateItem[]>("/api/templates"),
  });
  const [creating, setCreating] = useState<{ folderId: string | null } | null>(null);

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

  const create = useMutation({
    mutationFn: (input: { name: string; folderId: string | null; templateId: string | null }) =>
      api<ProjectDto>("/api/projects", { method: "POST", json: input }),
    onSuccess: (project) => {
      setCreating(null);
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push(`/projects/${project.id}`);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 409 ? t("nameTaken") : common("error"),
      ),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/projects/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      toast.success(t("itemDeleted"));
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
      if (pathname.startsWith(`/projects/${id}`)) router.push("/projects");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 403 ? t("deleteForbidden") : common("error"),
      ),
  });

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
        onNewItem={(folderId) => setCreating({ folderId })}
        deleteItem={(item) => {
          if (window.confirm(t("deleteItemConfirm", { name: item.name }))) remove.mutate(item.id);
        }}
      />
      <NewItemDialog
        open={creating !== null}
        title={t("newItem")}
        namespace="Projects.tree"
        folders={folders.data ?? []}
        initialFolderId={creating?.folderId ?? null}
        templates={templates.data}
        pending={create.isPending}
        onClose={() => setCreating(null)}
        onSubmit={(values) => create.mutate(values)}
      />
    </>
  );
}
