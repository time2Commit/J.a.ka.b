"use client";

import { FileText } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Meta } from "@/lib/types";
import { useFolders } from "@/features/folders/folder-tree";
import { RecentList, RecentRow } from "@/features/folders/recent-list";
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
      <RecentList heading={t("tree.recent")} empty={t("empty")} isEmpty={recent.length === 0}>
        {recent.map((p) => {
          const status = meta.data?.statuses.find((s) => s.id === p.statusId);
          return (
            <RecentRow
              key={p.id}
              href={`/projects/${p.id}`}
              icon={<FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              name={p.name}
              detail={folderPathNames(folders.data ?? [], p.folderId).join(" / ")}
            >
              {status && <Badge color={status.color}>{status.name}</Badge>}
              <span className="text-xs text-muted-foreground">
                {format.relativeTime(new Date(p.lastModified))}
              </span>
            </RecentRow>
          );
        })}
      </RecentList>
    </div>
  );
}
