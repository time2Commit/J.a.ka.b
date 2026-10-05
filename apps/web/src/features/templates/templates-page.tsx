"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { Meta, TemplateItem } from "@/lib/types";
import { TemplateDialog, templatesKey } from "./template-dialog";

export function TemplatesPage() {
  const t = useTranslations("Templates");
  const common = useTranslations("Common");
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  const templates = useQuery({
    queryKey: templatesKey,
    queryFn: () => api<TemplateItem[]>("/api/templates"),
  });
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(common("deleted"));
      void queryClient.invalidateQueries({ queryKey: templatesKey });
    },
    onError: () => toast.error(common("error")),
  });

  const statusName = (id: string | null) => meta.data?.statuses.find((s) => s.id === id)?.name;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("help")}</p>
        </div>
        <Button type="button" onClick={() => setEditing({ id: null })}>
          <Plus /> {t("new")}
        </Button>
      </div>

      {templates.data?.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
      )}
      <ul className="flex flex-col gap-3" aria-label={t("title")}>
        {templates.data?.map((tpl) => (
          <li key={tpl.id}>
            <Card>
              <CardContent className="flex items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <p className="truncate font-medium">{tpl.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      statusName(tpl.defaults.statusId),
                      t("minutes", { count: tpl.defaults.durationMin }),
                      tpl.defaults.checklist.length > 0
                        ? t("checklistCount", { count: tpl.defaults.checklist.length })
                        : null,
                      tpl.hasNote ? t("withNote") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("edit", { name: tpl.name })}
                    onClick={() => setEditing({ id: tpl.id })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("delete", { name: tpl.name })}
                    onClick={() => {
                      if (window.confirm(t("confirmDelete", { name: tpl.name }))) {
                        remove.mutate(tpl.id);
                      }
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <TemplateDialog
        templateId={editing?.id ?? null}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
    </div>
  );
}
