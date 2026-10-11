"use client";

import type { JSONContent } from "@tiptap/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { Meta, TemplateFull } from "@/lib/types";
import { TemplateNoteEditor } from "./template-note-editor";

/** The page of one template: defaults for new projects plus their initial note. */
export function TemplateEditor({ templateId }: { templateId: string }) {
  const t = useTranslations("Templates");
  const template = useQuery({
    queryKey: ["templates", templateId],
    queryFn: () => api<TemplateFull>(`/api/templates/${templateId}`),
  });
  if (template.isError) {
    return <p className="text-muted-foreground">{t("notFound")}</p>;
  }
  if (!template.data) return <p className="text-muted-foreground">…</p>;
  // Remounted per template (and after each save) so the form starts from the stored values.
  return (
    <TemplateForm key={`${template.data.id}-${template.data.updatedAt}`} template={template.data} />
  );
}

function TemplateForm({ template }: { template: TemplateFull }) {
  const t = useTranslations("Templates");
  const common = useTranslations("Common");
  const queryClient = useQueryClient();
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });
  const [name, setName] = useState(template.name);
  const [defaults, setDefaults] = useState(template.defaults);
  const [checklist, setChecklist] = useState(template.defaults.checklist.join("\n"));
  const [note, setNote] = useState<JSONContent | null>(template.note as JSONContent | null);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name,
        defaults: {
          ...defaults,
          checklist: checklist
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        },
        note,
      };
      return api(`/api/templates/${template.id}`, { method: "PATCH", json: body });
    },
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 409 ? t("nameTaken") : common("error"),
      ),
  });

  const toggle = (key: "labelIds" | "memberIds", id: string) =>
    setDefaults((d) => ({
      ...d,
      [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id],
    }));

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold tracking-tight">{template.name}</h2>
      <form
        className="mx-auto flex max-w-3xl flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="template-name">{t("name")}</Label>
          <Input
            id="template-name"
            value={name}
            maxLength={80}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="template-status">{t("status")}</Label>
            <Select
              id="template-status"
              value={defaults.statusId ?? ""}
              onChange={(e) => setDefaults({ ...defaults, statusId: e.target.value || null })}
            >
              <option value="">{t("firstStatus")}</option>
              {meta.data?.statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="template-duration">{t("duration")}</Label>
            <Input
              id="template-duration"
              type="number"
              min={5}
              max={10080}
              step={5}
              value={defaults.durationMin}
              onChange={(e) => setDefaults({ ...defaults, durationMin: Number(e.target.value) })}
            />
          </div>
        </div>

        {(meta.data?.labels.length ?? 0) > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t("labels")}</legend>
            <div className="flex flex-wrap gap-3">
              {meta.data?.labels.map((l) => (
                <label key={l.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={defaults.labelIds.includes(l.id)}
                    onChange={() => toggle("labelIds", l.id)}
                  />
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                  {l.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {(meta.data?.users.length ?? 0) > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">{t("members")}</legend>
            <div className="flex flex-wrap gap-3">
              {meta.data?.users.map((u) => (
                <label key={u.id} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={defaults.memberIds.includes(u.id)}
                    onChange={() => toggle("memberIds", u.id)}
                  />
                  {u.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="template-checklist">{t("checklist")}</Label>
          <textarea
            id="template-checklist"
            rows={3}
            value={checklist}
            onChange={(e) => setChecklist(e.target.value)}
            placeholder={t("checklistPlaceholder")}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          <p className="text-xs text-muted-foreground">{t("checklistHelp")}</p>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t("note")}</span>
          <TemplateNoteEditor initial={note} onChange={setNote} />
          <p className="text-xs text-muted-foreground">{t("noteHelp")}</p>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={save.isPending || name.trim() === ""}>
            {common("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
