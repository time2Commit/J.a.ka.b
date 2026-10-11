"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
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
import type { CardDto, Meta } from "@/lib/types";
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

/** The fields of a card that are saved on their own, as the PATCH /api/cards/:id body. */
interface CardPatch {
  title?: string | null;
  shortNotes?: string | null;
  statusId?: string;
  progress?: number;
  labelIds?: string[];
  memberIds?: string[];
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

  // Drafts of the fields typed or dragged; everything else is read straight from the card.
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [progress, setProgress] = useState(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const cardId = card?.id;
  useEffect(() => {
    if (!card) return;
    setTitle(card.title ?? "");
    setNotes(card.shortNotes ?? "");
    setProgress(card.progress);
    // Only when another card is opened: a refresh must not overwrite what is being typed.
  }, [cardId]);

  /** Applies the change to the cached cards right away, so the calendar follows without a wait. */
  function applyLocally(id: string, patch: CardPatch) {
    queryClient.setQueriesData<CardDto[]>({ queryKey: ["cards"] }, (old) =>
      old?.map((c) => {
        if (c.id !== id) return c;
        const status = patch.statusId ? meta.statuses.find((s) => s.id === patch.statusId) : null;
        return {
          ...c,
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.shortNotes !== undefined && { shortNotes: patch.shortNotes }),
          ...(patch.progress !== undefined && { progress: patch.progress }),
          ...(status && { status }),
          ...(patch.labelIds && {
            labels: meta.labels.filter((l) => patch.labelIds!.includes(l.id)),
          }),
          ...(patch.memberIds && { memberIds: patch.memberIds }),
        };
      }),
    );
  }

  const save = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CardPatch }) =>
      api(`/api/cards/${id}`, { method: "PATCH", json: patch }),
    onMutate: ({ id, patch }) => applyLocally(id, patch),
    onError: () => toast.error(common("error")),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  /** Saves a change now. Typed or dragged values wait until the person pauses (see `later`). */
  function now(patch: CardPatch) {
    if (card) save.mutate({ id: card.id, patch });
  }
  function later(key: string, patch: CardPatch, delay = 600) {
    if (!card) return;
    const id = card.id;
    clearTimeout(timers.current.get(key));
    // Not cleared when the panel closes: a change made just before closing is still saved.
    timers.current.set(
      key,
      setTimeout(() => save.mutate({ id, patch }), delay),
    );
  }
  function flush(key: string, patch: CardPatch) {
    if (!card || !timers.current.has(key)) return;
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    save.mutate({ id: card.id, patch });
  }

  const remove = useMutation({
    mutationFn: () => api(`/api/cards/${card!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("cardDeleted"));
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
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
              <DialogDescription>{t("autosave")}</DialogDescription>
            </DialogHeader>

            <section className="flex flex-col gap-3" aria-label={t("sectionCard")}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-status">{t("status")}</Label>
                <Select
                  id="c-status"
                  value={card.status.id}
                  onChange={(e) => now({ statusId: e.target.value })}
                >
                  {meta.statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-progress">
                  {t("progress")}: {progress}%
                </Label>
                <input
                  id="c-progress"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progress}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setProgress(value);
                    later("progress", { progress: value }, 400);
                  }}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t("labels")}</span>
                <div className="flex flex-wrap gap-1.5">
                  {meta.labels.map((l) => (
                    <Chip
                      key={l.id}
                      color={l.color}
                      active={card.labels.some((x) => x.id === l.id)}
                      onClick={() =>
                        now({
                          labelIds: toggle(
                            card.labels.map((x) => x.id),
                            l.id,
                          ),
                        })
                      }
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
                      active={card.memberIds.includes(u.id)}
                      onClick={() => now({ memberIds: toggle(card.memberIds, u.id) })}
                    >
                      {u.name}
                    </Chip>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-title">{t("title")}</Label>
                <Input
                  id="c-title"
                  value={title}
                  maxLength={120}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    later("title", { title: e.target.value.trim() || null });
                  }}
                  onBlur={() => flush("title", { title: title.trim() || null })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="c-notes">{t("notes")}</Label>
                <Input
                  id="c-notes"
                  value={notes}
                  maxLength={2000}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    later("notes", { shortNotes: e.target.value.trim() || null });
                  }}
                  onBlur={() => flush("notes", { shortNotes: notes.trim() || null })}
                />
              </div>
              <Button
                variant="ghost"
                className="self-start text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(common("confirmDelete"))) remove.mutate();
                }}
              >
                <Trash2 /> {t("deleteCard")}
              </Button>
            </section>

            <hr />

            <Button asChild variant="outline" className="self-start">
              <Link href={`/projects/${card.projectId}`}>
                <FileText /> {t("openNote")}
              </Link>
            </Button>
            <p className="text-xs text-muted-foreground">{t("noteShared")}</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
