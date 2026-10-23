"use client";

import { useQuery } from "@tanstack/react-query";
import { FileStack } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useFolders } from "@/features/folders/folder-tree";
import { RecentList, RecentRow } from "@/features/folders/recent-list";
import { folderPathNames } from "@/features/folders/tree";
import { api } from "@/lib/api";
import type { Meta } from "@/lib/types";
import { useTemplateList } from "./templates-tree";

/** The overview next to the template tree: what a template is for, and the latest ones. */
export function TemplatesHome() {
  const t = useTranslations("Templates");
  const format = useFormatter();
  const templates = useTemplateList();
  const folders = useFolders("template");
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });
  const recent = [...(templates.data ?? [])]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 8);
  const statusName = (id: string | null) => meta.data?.statuses.find((s) => s.id === id)?.name;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <p className="text-muted-foreground">{t("help")}</p>
      <p className="text-muted-foreground">{t("tree.pickOne")}</p>
      <RecentList
        heading={t("tree.recent")}
        empty={t("empty")}
        isEmpty={recent.length === 0}
        listLabel={t("title")}
      >
        {recent.map((tpl) => {
          const path = folderPathNames(folders.data ?? [], tpl.folderId).join(" / ");
          const details = [
            statusName(tpl.defaults.statusId),
            t("minutes", { count: tpl.defaults.durationMin }),
            tpl.defaults.checklist.length > 0
              ? t("checklistCount", { count: tpl.defaults.checklist.length })
              : null,
            tpl.hasNote ? t("withNote") : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <RecentRow
              key={tpl.id}
              href={`/templates/${tpl.id}`}
              icon={<FileStack className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
              name={tpl.name}
              detail={[path, details].filter(Boolean).join(" — ")}
            >
              <span className="text-xs text-muted-foreground">
                {format.relativeTime(new Date(tpl.updatedAt))}
              </span>
            </RecentRow>
          );
        })}
      </RecentList>
    </div>
  );
}
