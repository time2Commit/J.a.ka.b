"use client";

import { useQuery } from "@tanstack/react-query";
import { FileStack } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useFolders } from "@/features/folders/folder-tree";
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
      {recent.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <section aria-label={t("tree.recent")} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t("tree.recent")}</h2>
          <ul className="flex flex-col divide-y rounded-xl border bg-card" aria-label={t("title")}>
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
                <li key={tpl.id}>
                  <Link
                    href={`/templates/${tpl.id}`}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-accent/50"
                  >
                    <FileStack className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{tpl.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[path, details].filter(Boolean).join(" — ")}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format.relativeTime(new Date(tpl.updatedAt))}
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
