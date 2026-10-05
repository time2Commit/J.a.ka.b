"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";

interface Preview {
  kind: "project" | "board";
  exportedAt: string;
  hasWorkspace: boolean;
  projects: {
    slug: string;
    name: string;
    exists: boolean;
    cards: number;
    attachments: number;
    hasVersions: boolean;
  }[];
  newStatuses: string[];
  newLabels: string[];
  templates: { name: string; exists: boolean }[];
  people: { email: string; name: string | null; exists: boolean }[];
}

interface Result {
  imported: { slug: string; name: string; projectId: string; renamedFrom?: string }[];
  skipped: { slug: string; name: string }[];
  failed: { slug: string; name: string; message: string }[];
  templatesImported: number;
  createdUsers: { email: string; name: string; password: string }[];
}

type Conflict = "skip" | "rename" | "replace";

/** Import of a project or board archive: upload, preview, choices, result. */
export function ImportSection() {
  const t = useTranslations("Settings.import");
  const common = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ importId: string; preview: Preview } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [conflict, setConflict] = useState<Conflict>("skip");
  const [createUsers, setCreateUsers] = useState(true);
  const [applyWorkspace, setApplyWorkspace] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const preview = useMutation({
    mutationFn: (file: File) =>
      api<{ importId: string; preview: Preview }>("/api/import", { method: "POST", body: file }),
    onSuccess: (data) => {
      setUpload(data);
      setResult(null);
      setSelected(new Set(data.preview.projects.map((p) => p.slug)));
      setCreateUsers(data.preview.people.some((p) => !p.exists));
      setApplyWorkspace(false);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 400
          ? t("invalid")
          : error instanceof ApiError && error.status === 413
            ? t("tooLarge")
            : common("error"),
      ),
  });

  const run = useMutation({
    mutationFn: () =>
      api<Result>(`/api/import/${upload!.importId}`, {
        method: "POST",
        json: {
          conflict,
          createMissingUsers: createUsers,
          applyWorkspace,
          slugs: [...selected],
        },
      }),
    onSuccess: (data) => {
      setResult(data);
      setUpload(null);
      void queryClient.invalidateQueries();
    },
    onError: () => toast.error(common("error")),
  });

  async function cancel() {
    if (upload) await api(`/api/import/${upload.importId}`, { method: "DELETE" }).catch(() => {});
    setUpload(null);
  }

  const missing = upload?.preview.people.filter((p) => !p.exists) ?? [];
  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("help")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!upload && (
          <div>
            <input
              ref={fileInput}
              type="file"
              accept=".zip,application/zip"
              hidden
              aria-label={t("choose")}
              data-testid="import-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) preview.mutate(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={preview.isPending}
              onClick={() => fileInput.current?.click()}
            >
              <Upload /> {preview.isPending ? t("reading") : t("choose")}
            </Button>
          </div>
        )}

        {upload && (
          <div className="flex flex-col gap-4" data-testid="import-preview">
            <p className="text-sm">
              {t(upload.preview.kind === "board" ? "summaryBoard" : "summaryProject", {
                date: when(upload.preview.exportedAt),
              })}
            </p>

            <ul className="flex flex-col gap-1" aria-label={t("projects")}>
              {upload.preview.projects.map((p) => (
                <li key={p.slug}>
                  <label className="flex flex-wrap items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(p.slug)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(p.slug);
                        else next.delete(p.slug);
                        setSelected(next);
                      }}
                    />
                    <span className="font-medium">{p.name}</span>
                    {p.exists && <Badge color="#d97706">{t("exists")}</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {t("counts", { cards: p.cards, files: p.attachments })}
                      {p.hasVersions ? ` · ${t("withVersions")}` : ""}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            {(upload.preview.newStatuses.length > 0 || upload.preview.newLabels.length > 0) && (
              <p className="text-sm text-muted-foreground">
                {t("willCreate", {
                  items: [...upload.preview.newStatuses, ...upload.preview.newLabels].join(", "),
                })}
              </p>
            )}

            {upload.preview.templates.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("templates", {
                  count: upload.preview.templates.filter((x) => !x.exists).length,
                  skipped: upload.preview.templates.filter((x) => x.exists).length,
                })}
              </p>
            )}

            {upload.preview.projects.some((p) => p.exists) && (
              <fieldset className="flex flex-col gap-1 text-sm">
                <legend className="mb-1 font-medium">{t("conflict")}</legend>
                {(["skip", "rename", "replace"] as const).map((c) => (
                  <label key={c} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="conflict"
                      checked={conflict === c}
                      onChange={() => setConflict(c)}
                    />
                    {t(`conflicts.${c}`)}
                  </label>
                ))}
                {conflict === "replace" && (
                  <p className="text-xs text-destructive" role="alert">
                    {t("replaceWarning")}
                  </p>
                )}
              </fieldset>
            )}

            {missing.length > 0 && (
              <div className="flex flex-col gap-1 text-sm">
                <p>{t("missingPeople", { count: missing.length })}</p>
                <p className="text-xs text-muted-foreground">
                  {missing.map((p) => p.name ?? p.email).join(", ")}
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createUsers}
                    onChange={(e) => setCreateUsers(e.target.checked)}
                  />
                  {t("createUsers")}
                </label>
              </div>
            )}

            {upload.preview.hasWorkspace && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={applyWorkspace}
                  onChange={(e) => setApplyWorkspace(e.target.checked)}
                />
                {t("applyWorkspace")}
              </label>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                disabled={run.isPending || selected.size === 0}
                onClick={() => run.mutate()}
              >
                {run.isPending ? t("importing") : t("import", { count: selected.size })}
              </Button>
              <Button type="button" variant="ghost" disabled={run.isPending} onClick={cancel}>
                {common("cancel")}
              </Button>
            </div>
          </div>
        )}

        {result && (
          <div className="flex flex-col gap-3 text-sm" role="status" data-testid="import-result">
            <p className="font-medium">
              {t("result", {
                imported: result.imported.length,
                skipped: result.skipped.length,
                failed: result.failed.length,
              })}
            </p>
            {result.templatesImported > 0 && (
              <p>{t("templatesResult", { count: result.templatesImported })}</p>
            )}
            {result.failed.length > 0 && (
              <ul className="text-destructive">
                {result.failed.map((f) => (
                  <li key={f.slug}>
                    {f.name}: {f.message}
                  </li>
                ))}
              </ul>
            )}
            {result.createdUsers.length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="font-medium">{t("tempPasswords")}</p>
                <p className="text-xs text-muted-foreground">{t("tempPasswordsHelp")}</p>
                <table className="text-xs">
                  <tbody>
                    {result.createdUsers.map((u) => (
                      <tr key={u.email}>
                        <td className="pr-4">{u.email}</td>
                        <td className="font-mono">{u.password}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
