"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { ProjectListItem } from "@/lib/types";
import { draftToRange, type Draft } from "./time";

type Mode = "new" | "existing";

export function NewCardDialog({
  open,
  onOpenChange,
  draft,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Draft;
  timeZone: string;
}) {
  const t = useTranslations("Card");
  const common = useTranslations("Common");
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Draft>(draft);
  const [mode, setMode] = useState<Mode>("new");
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) {
      setForm(draft);
      setTitle("");
      setNotes("");
      setProjectName("");
      setProjectId("");
    }
  }, [open, draft]);

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<ProjectListItem[]>("/api/projects"),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => {
      const range = draftToRange(form, timeZone);
      return api("/api/cards", {
        method: "POST",
        json: {
          ...(mode === "new" ? { projectName } : { projectId }),
          title: title || undefined,
          shortNotes: notes || undefined,
          allDay: form.allDay,
          ...range,
        },
      });
    },
    onSuccess: () => {
      toast.success(t("created"));
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 409 ? t("projectExists") : common("error"),
      ),
  });

  const range = draftToRange(form, timeZone);
  const invalidRange = new Date(range.end) < new Date(range.start);
  const canSubmit =
    !invalidRange && !create.isPending && (mode === "new" ? projectName.trim() : projectId);
  const set = (patch: Partial<Draft>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newTitle")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) create.mutate();
          }}
        >
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t("project")}</legend>
            <div className="flex gap-4 text-sm">
              {(["new", "existing"] as const).map((m) => (
                <label key={m} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  {m === "new" ? t("newProject") : t("existingProject")}
                </label>
              ))}
            </div>
            {mode === "new" ? (
              <Input
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={t("projectName")}
                aria-label={t("projectName")}
                maxLength={120}
                required
                autoFocus
              />
            ) : (
              <Select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label={t("existingProject")}
                required
              >
                <option value="">{t("selectProject")}</option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <Label htmlFor="card-title">{t("title")}</Label>
            <Input
              id="card-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.allDay}
              onChange={(e) => set({ allDay: e.target.checked })}
            />
            {t("allDay")}
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="card-date">{t("date")}</Label>
              <Input
                id="card-date"
                type="date"
                value={form.date}
                onChange={(e) =>
                  set({
                    date: e.target.value,
                    endDate: form.endDate < e.target.value ? e.target.value : form.endDate,
                  })
                }
                required
              />
            </div>
            {!form.allDay && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="card-start">{t("startTime")}</Label>
                <Input
                  id="card-start"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => set({ startTime: e.target.value })}
                  required
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="card-end-date">{t("endDate")}</Label>
              <Input
                id="card-end-date"
                type="date"
                min={form.date}
                value={form.endDate}
                onChange={(e) => set({ endDate: e.target.value })}
                required
              />
            </div>
            {!form.allDay && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="card-end">{t("endTime")}</Label>
                <Input
                  id="card-end"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => set({ endTime: e.target.value })}
                  required
                />
              </div>
            )}
          </div>
          {invalidRange && <p className="text-sm text-destructive">{t("invalidRange")}</p>}

          <div className="flex flex-col gap-2">
            <Label htmlFor="card-notes">{t("notes")}</Label>
            <Input
              id="card-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {common("cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {common("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
