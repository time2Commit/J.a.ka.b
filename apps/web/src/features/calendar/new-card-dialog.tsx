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
import { templatesKey } from "@/features/templates/template-dialog";
import type { ProjectListItem, Status, TemplateItem } from "@/lib/types";
import { ProjectCombobox, type ProjectChoice } from "./project-combobox";
import { autoEndDate, draftToRange, withDuration, type Draft } from "./time";

export function NewCardDialog({
  open,
  onOpenChange,
  draft,
  timeZone,
  statuses,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: Draft;
  timeZone: string;
  statuses: Status[];
}) {
  const t = useTranslations("Card");
  const common = useTranslations("Common");
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Draft>(draft);
  // Until the user picks the last day, it follows the start date and the times.
  const [endManual, setEndManual] = useState(false);
  const [choice, setChoice] = useState<ProjectChoice>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  // New projects only: "" (empty), "t:<template id>" or "p:<project id>" (a copy of it).
  const [startFrom, setStartFrom] = useState("");
  const [cloneNote, setCloneNote] = useState(true);

  const isNewProject = choice?.kind === "new";
  const templates = useQuery({
    queryKey: templatesKey,
    queryFn: () => api<TemplateItem[]>("/api/templates"),
    enabled: open && isNewProject,
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<ProjectListItem[]>("/api/projects"),
    enabled: open && isNewProject,
  });

  useEffect(() => {
    if (open) {
      setForm(draft);
      setEndManual(draft.endDate !== autoEndDate(draft));
      setTitle("");
      setNotes("");
      setChoice(null);
      setStartFrom("");
      setCloneNote(true);
    }
  }, [open, draft]);

  const create = useMutation({
    mutationFn: () => {
      const range = draftToRange(form, timeZone);
      return api("/api/cards", {
        method: "POST",
        json: {
          ...(choice?.kind === "existing"
            ? { projectId: choice.id }
            : {
                projectName: choice?.name,
                ...(startFrom.startsWith("t:") && { templateId: startFrom.slice(2) }),
                ...(startFrom.startsWith("p:") && {
                  cloneFromProjectId: startFrom.slice(2),
                  cloneNote,
                }),
              }),
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
  const canSubmit = !invalidRange && !create.isPending && choice !== null;
  const set = (patch: Partial<Draft>) => {
    if ("endDate" in patch) setEndManual(true);
    setForm((f) => {
      const next = { ...f, ...patch };
      return endManual || "endDate" in patch ? next : { ...next, endDate: autoEndDate(next) };
    });
  };

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
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("project")}</span>
            <ProjectCombobox
              value={choice}
              onChange={(next) => {
                setChoice(next);
                setStartFrom("");
              }}
              statuses={statuses}
            />
          </div>

          {isNewProject &&
            ((templates.data?.length ?? 0) > 0 || (projects.data?.length ?? 0) > 0) && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="card-start-from">{t("startFrom")}</Label>
                <Select
                  id="card-start-from"
                  value={startFrom}
                  onChange={(e) => {
                    const value = e.target.value;
                    setStartFrom(value);
                    const template = templates.data?.find((x) => `t:${x.id}` === value);
                    // A template also sets how long its first card is.
                    if (template) {
                      setEndManual(true);
                      setForm((f) => withDuration(f, template.defaults.durationMin));
                    }
                  }}
                >
                  <option value="">{t("startEmpty")}</option>
                  {(templates.data?.length ?? 0) > 0 && (
                    <optgroup label={t("startTemplates")}>
                      {templates.data?.map((x) => (
                        <option key={x.id} value={`t:${x.id}`}>
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {(projects.data?.length ?? 0) > 0 && (
                    <optgroup label={t("startClone")}>
                      {projects.data?.map((x) => (
                        <option key={x.id} value={`p:${x.id}`}>
                          {x.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
                {startFrom.startsWith("p:") && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={cloneNote}
                      onChange={(e) => setCloneNote(e.target.checked)}
                    />
                    {t("cloneNote")}
                  </label>
                )}
              </div>
            )}

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
                onChange={(e) => set({ date: e.target.value })}
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
