"use client";

import { FileText } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Meta } from "@/lib/types";
import { useFolders } from "@/features/folders/folder-tree";
import { folderPathNames } from "@/features/folders/tree";
import { useProjectTreeData } from "./projects-tree";

/** The overview next to the tree: the projects touched most recently. */
export function ProjectsHome() {
  const t = useTranslations("Projects");
  const format = useFormatter();
  const projects = useProjectTreeData();
  const folders = useFolders("project");
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });
  const recent = [...(projects.data ?? [])]
    .sort((a, b) => Date.parse(b.lastModified) - Date.parse(a.lastModified))
    .slice(0, 8);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <p className="text-muted-foreground">{t("tree.pickOne")}</p>
      {recent.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <section aria-label={t("tree.recent")} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t("tree.recent")}</h2>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {recent.map((p) => {
              const status = meta.data?.statuses.find((s) => s.id === p.statusId);
              const path = folderPathNames(folders.data ?? [], p.folderId).join(" / ");
              return (
                <li key={p.id}>
                  <Link
                    href={`/projects/${p.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/50"
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{p.name}</span>
                      {path && (
                        <span className="block truncate text-xs text-muted-foreground">{path}</span>
                      )}
                    </span>
                    {status && <Badge color={status.color}>{status.name}</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {format.relativeTime(new Date(p.lastModified))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
