"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { CardDto, Meta, ProjectDto } from "@/lib/types";
import { cn } from "@/lib/utils";

function Chip({
  active,
  color,
  children,
  onClick,
}: {
  active: boolean;
  color: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
        active ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50",
      )}
    >
      <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </button>
  );
}

function toggle(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function CardPanel({
  card,
  meta,
  onClose,
}: {
  card: CardDto | null;
  meta: Meta;
  onClose: () => void;
}) {
  const t = useTranslations("Card");
  const common = useTranslations("Common");
  const queryClient = useQueryClient();

  const project = useQuery({
    queryKey: ["projects", card?.projectId],
    queryFn: () => api<ProjectDto>(`/api/projects/${card!.projectId}`),
    enabled: Boolean(card),
  });

  // Project-level fields
  const [statusId, setStatusId] = useState("");
  const [progress, setProgress] = useState(0);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  // Card-level fields
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [statusOverrideId, setStatusOverrideId] = useState("");
  const [overrideProgress, setOverrideProgress] = useState(false);
  const [progressOverride, setProgressOverride] = useState(0);

  useEffect(() => {
    if (!card) return;
    setTitle(card.title ?? "");
    setNotes(card.shortNotes ?? "");
    setStatusOverrideId(card.statusOverridden ? card.status.id : "");
    setOverrideProgress(card.progressOverridden);
    setProgressOverride(card.progress);
  }, [card]);

  useEffect(() => {
    if (!project.data) return;
    setStatusId(project.data.statusId);
    setProgress(project.data.progress);
    setLabelIds(project.data.labelIds);
    setMemberIds(project.data.memberIds);
  }, [project.data]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["cards"] });
    void queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const saveProject = useMutation({
    mutationFn: () =>
      api(`/api/projects/${card!.projectId}`, {
        method: "PATCH",
        json: { statusId, progress, labelIds, memberIds },
      }),
    onSuccess: () => {
      toast.success(common("saved"));
      refresh();
    },
    onError: () => toast.error(common("error")),
  });

  const saveCard = useMutation({
    mutationFn: () =>
      api(`/api/cards/${card!.id}`, {
        method: "PATCH",
        json: {
          title: title.trim() || null,
          shortNotes: notes.trim() || null,
          statusOverrideId: statusOverrideId || null,
          progressOverride: overrideProgress ? progressOverride : null,
        },
      }),
    onSuccess: () => {
      toast.success(common("saved"));
      refresh();
    },
    onError: () => toast.error(common("error")),
  });

  const remove = useMutation({
    mutationFn: () => api(`/api/cards/${card!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("cardDeleted"));
      refresh();
      onClose();
    },
    onError: () => toast.error(common("error")),
  });

  return (
    <Dialog open={Boolean(card)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent side="right">
        {card && (
          <>
            <DialogHeader>
              <DialogTitle>{card.projectName}</DialogTitle>
              <DialogDescription>{t("details")}</DialogDescription>
            </DialogHeader>

            <section className="flex flex-col gap-3" aria-label={t("sectionProject")}>
              <h3 className="text-sm font-semibold">{t("sectionProject")}</h3>
              <div className="flex flex-col gap-2">
                <Label htmlFor="p-status">{t("status")}</Label>
                <Select
                  id="p-status"
                  value={statusId}
                  onChange={(e) => setStatusId(e.target.value)}
                >
                  {meta.statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="p-progress">
                  {t("progress")}: {progress}%
                </Label>
                <input
                  id="p-progress"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t("labels")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {meta.labels.map((l) => (
                    <Chip
                      key={l.id}
                      color={l.color}
                      active={labelIds.includes(l.id)}
                      onClick={() => setLabelIds(toggle(labelIds, l.id))}
                    >
                      {l.name}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t("members")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {meta.users.map((u) => (
                    <Chip
                      key={u.id}
                      color={u.avatarColor}
                      active={memberIds.includes(u.id)}
                      onClick={() => setMemberIds(toggle(memberIds, u.id))}
                    >
                      {u.name}
                    </Chip>
                  ))}
                </div>
              </div>
              <Button
                variant="secondary"
                className="self-start"
                disabled={!project.data || saveProject.isPending}
                onClick={() => saveProject.mutate()}
              >
                {common("save")}
              </Button>
            </section>

            <hr />

            <section className="flex flex-col gap-3" aria-label={t("sectionCard")}>
              <h3 className="text-sm font-semibold">{t("sectionCard")}</h3>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-title">{t("title")}</Label>
                <Input
                  id="c-title"
                  value={title}
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-notes">{t("notes")}</Label>
                <Input
                  id="c-notes"
                  value={notes}
                  maxLength={2000}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-status">{t("status")}</Label>
                <Select
                  id="c-status"
                  value={statusOverrideId}
                  onChange={(e) => setStatusOverrideId(e.target.value)}
                >
                  <option value="">{t("sameAsProject")}</option>
                  {meta.statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={overrideProgress}
                    onChange={(e) => setOverrideProgress(e.target.checked)}
                  />
                  {t("override")}: {t("progress")}
                  {overrideProgress && ` ${progressOverride}%`}
                </label>
                {overrideProgress && (
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={progressOverride}
                    aria-label={t("progress")}
                    onChange={(e) => setProgressOverride(Number(e.target.value))}
                  />
                )}
              </div>
              <div className="flex items-center justify-between">
                <Button disabled={saveCard.isPending} onClick={() => saveCard.mutate()}>
                  {common("save")}
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={remove.isPending}
                  onClick={() => {
                    if (window.confirm(common("confirmDelete"))) remove.mutate();
                  }}
                >
                  <Trash2 /> {t("deleteCard")}
                </Button>
              </div>
            </section>

            <p className="text-xs text-muted-foreground">{t("noteSoon")}</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
