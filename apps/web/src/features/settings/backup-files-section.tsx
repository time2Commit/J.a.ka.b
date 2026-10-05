"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatabaseBackup, Download } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";

interface BackupFile {
  name: string;
  kind: "archive" | "database";
  size: number;
  createdAt: string;
}
interface BackupsResponse {
  cron: string | null;
  keep: number;
  files: BackupFile[];
}
interface BackupResult {
  dumpError: string | null;
}

const backupsKey = ["backups"] as const;

/** Backups the server keeps on its own: schedule, list, download, "back up now". */
export function BackupFilesSection() {
  const t = useTranslations("Settings.backupFiles");
  const common = useTranslations("Common");
  const format = useFormatter();
  const queryClient = useQueryClient();
  const backups = useQuery({
    queryKey: backupsKey,
    queryFn: () => api<BackupsResponse>("/api/admin/backups"),
  });

  const run = useMutation({
    mutationFn: () => api<BackupResult>("/api/admin/backups", { method: "POST" }),
    onSuccess: (result) => {
      if (result.dumpError) toast.warning(t("noDump"));
      else toast.success(t("done"));
      void queryClient.invalidateQueries({ queryKey: backupsKey });
    },
    onError: () => toast.error(common("error")),
  });

  const size = (bytes: number) =>
    format.number(bytes / (1024 * 1024), { maximumFractionDigits: 1 }) + " MB";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
        {/* Only once the settings are known: before that, "no schedule" would be a false claim. */}
        {backups.data && (
          <p className="text-sm text-muted-foreground">
            {backups.data.cron
              ? t("scheduled", { cron: backups.data.cron, keep: backups.data.keep })
              : t("notScheduled")}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          className="w-fit"
          disabled={run.isPending || !backups.data}
          onClick={() => run.mutate()}
        >
          <DatabaseBackup /> {run.isPending ? t("running") : t("now")}
        </Button>
        {backups.data?.files.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
        <ul
          className="flex flex-col gap-1 text-sm"
          aria-label={t("list")}
          data-testid="backup-list"
        >
          {backups.data?.files.map((f) => (
            <li key={f.name} className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a
                href={`/api/admin/backups/${encodeURIComponent(f.name)}`}
                download
                className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
              >
                <Download className="size-3.5" /> {f.name}
              </a>
              <span className="text-xs text-muted-foreground">
                {t(f.kind)} · {size(f.size)} ·{" "}
                {format.dateTime(new Date(f.createdAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
