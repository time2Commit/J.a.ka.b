"use client";

import type { JSONContent } from "@tiptap/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { diffBlocks } from "@jakab/editor";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { VersionPreview } from "./version-preview";

export interface VersionAuthor {
  id: string;
  name: string;
  avatarColor: string;
}

export interface VersionItem {
  id: string;
  reason: "auto" | "manual" | "pre_restore";
  label: string | null;
  createdAt: string;
  authors: VersionAuthor[];
}

interface VersionDetail extends VersionItem {
  json: JSONContent;
}

export const versionsKey = (projectId: string) => ["versions", projectId] as const;

const REASON_COLOR = { auto: "#64748b", manual: "#2563eb", pre_restore: "#d97706" } as const;

export function VersionHistory({
  projectId,
  open,
  onOpenChange,
  getCurrentJson,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Live content of the note, for the "changes since this version" view. */
  getCurrentJson: () => JSONContent;
}) {
  const t = useTranslations("Note.history");
  const common = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"preview" | "changes">("preview");
  const [confirming, setConfirming] = useState(false);

  const list = useQuery({
    queryKey: versionsKey(projectId),
    queryFn: () => api<VersionItem[]>(`/api/projects/${projectId}/versions`),
    enabled: open,
  });
  const selected = selectedId ?? list.data?.[0]?.id ?? null;
  const detail = useQuery({
    queryKey: [...versionsKey(projectId), selected],
    queryFn: () => api<VersionDetail>(`/api/projects/${projectId}/versions/${selected}`),
    enabled: open && selected !== null,
  });

  const diff = useMemo(
    () =>
      open && mode === "changes" && detail.data
        ? diffBlocks(detail.data.json, getCurrentJson())
        : null,
    // The live note may change while the dialog is open; recompute when the version or mode does.
    [open, mode, detail.data],
  );

  const restore = useMutation({
    mutationFn: () =>
      api(`/api/projects/${projectId}/versions/${selected}/restore`, { method: "POST" }),
    onSuccess: () => {
      toast.success(t("restored"));
      void queryClient.invalidateQueries({ queryKey: versionsKey(projectId) });
      setConfirming(false);
      onOpenChange(false);
    },
    onError: () => toast.error(common("error")),
  });

  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });
  const reasonLabel = (v: VersionItem) =>
    v.reason === "manual" ? (v.label ?? t("reason.manual")) : t(`reason.${v.reason}`);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirming(false);
        onOpenChange(next);
      }}
    >
      <DialogContent className="h-[85svh] max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {list.data?.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-[16rem_1fr]">
            <ul
              aria-label={t("list")}
              data-testid="version-list"
              className="flex max-h-48 flex-col gap-1 overflow-y-auto md:max-h-none"
            >
              {list.data?.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    aria-current={v.id === selected}
                    onClick={() => {
                      setSelectedId(v.id);
                      setConfirming(false);
                    }}
                    className={cn(
                      "flex w-full flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                      v.id === selected && "border-primary bg-accent",
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <Badge color={REASON_COLOR[v.reason]}>{t(`reason.${v.reason}`)}</Badge>
                    </span>
                    <span className="font-medium">
                      {v.reason === "manual" && v.label ? v.label : when(v.createdAt)}
                    </span>
                    {v.reason === "manual" && v.label && (
                      <span className="text-xs text-muted-foreground">{when(v.createdAt)}</span>
                    )}
                    {v.authors.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {v.authors.map((a) => a.name).join(", ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>

            <div className="flex min-h-0 flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div role="group" aria-label={t("view")} className="flex gap-1">
                  {(["preview", "changes"] as const).map((m) => (
                    <Button
                      key={m}
                      type="button"
                      size="sm"
                      variant={mode === m ? "secondary" : "ghost"}
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                    >
                      {t(`mode.${m}`)}
                    </Button>
                  ))}
                </div>
                {confirming ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{t("confirmRestore")}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirming(false)}
                    >
                      {common("cancel")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate()}
                    >
                      {t("restoreConfirm")}
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={!detail.data}
                    onClick={() => setConfirming(true)}
                  >
                    {t("restore")}
                  </Button>
                )}
              </div>
              {confirming && <p className="text-xs text-muted-foreground">{t("restoreNote")}</p>}
              {mode === "changes" && diff && (
                <p className="text-xs text-muted-foreground" role="status">
                  {diff.changed ? t("changesLegend") : t("noChanges")}
                </p>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-card px-4 py-3">
                {detail.data ? (
                  <VersionPreview
                    json={diff?.doc ?? detail.data.json}
                    changes={diff?.changes ?? null}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{common("loading")}</p>
                )}
              </div>
              {detail.data && (
                <p className="text-xs text-muted-foreground">
                  {reasonLabel(detail.data)} · {when(detail.data.createdAt)}
                </p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
