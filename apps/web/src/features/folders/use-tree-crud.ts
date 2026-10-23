"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { isOnItemPage, type TreeItem } from "./tree";

/**
 * What the trees of projects and of templates do the same way: create an item (and open it),
 * delete one after a confirmation (and leave its page if it was open).
 */
export function useTreeCrud<Input extends object>(options: {
  namespace: "Projects.tree" | "Templates.tree";
  /** Collection endpoint, e.g. "/api/projects". */
  apiPath: string;
  /** Page of an item, e.g. "/projects": items open at `${basePath}/${id}`. */
  basePath: string;
  /** Root of the cached lists that change when an item is created or deleted. */
  queryRoot: "projects" | "templates";
  /** Other cached data that changes when an item is deleted (a project's cards go with it). */
  alsoOnDelete?: string[];
  /** The API refuses with 403 when the person may not delete (projects only). */
  forbiddenOnDelete?: boolean;
  /** A specific message for a failed creation, or null to fall back to the generic one. */
  errorMessage?: (error: unknown) => string | null;
}) {
  const {
    namespace,
    apiPath,
    basePath,
    queryRoot,
    alsoOnDelete = [],
    forbiddenOnDelete,
    errorMessage,
  } = options;
  const t = useTranslations(namespace);
  const common = useTranslations("Common");
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  /** Set while the "new item" dialog is open: the folder it starts in. */
  const [creating, setCreating] = useState<{ folderId: string | null } | null>(null);

  const create = useMutation({
    mutationFn: (input: Input) => api<{ id: string }>(apiPath, { method: "POST", json: input }),
    onSuccess: (item) => {
      setCreating(null);
      void queryClient.invalidateQueries({ queryKey: [queryRoot] });
      router.push(`${basePath}/${item.id}`);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 409
          ? t("nameTaken")
          : (errorMessage?.(error) ?? common("error")),
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`${apiPath}/${id}`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      toast.success(t("itemDeleted"));
      for (const root of [queryRoot, ...alsoOnDelete]) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
      if (isOnItemPage(pathname, basePath, id)) router.push(basePath);
    },
    onError: (error) =>
      toast.error(
        forbiddenOnDelete && error instanceof ApiError && error.status === 403
          ? t("deleteForbidden")
          : common("error"),
      ),
  });

  return {
    creating,
    startCreating: (folderId: string | null) => setCreating({ folderId }),
    stopCreating: () => setCreating(null),
    create,
    deleteItem: (item: TreeItem) => {
      if (window.confirm(t("deleteItemConfirm", { name: item.name }))) remove.mutate(item.id);
    },
  };
}
