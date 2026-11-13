"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SourceCatalogEntry, SourceDto, SourceListDto } from "@jakab/shared";
import { ExternalLink, Pause, Play, RefreshCw, Settings2, Unplug } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { DialogField, FormDialog } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import type { Meta } from "@/lib/types";
import { SectionCard } from "./section-card";
import { sourceKindUi } from "./source-kinds";

const COLORS = ["#8b5cf6", "#06b6d4", "#ec4899", "#f59e0b", "#22c55e", "#ef4444"];

type Config = Record<string, unknown>;
const ERROR_CODES = [
  "key_rejected",
  "key_unreadable",
  "quota",
  "quota_cap",
  "unavailable",
  "invalid_response",
  "unknown",
] as const;

/** Refreshes everything a change to a source can alter: the settings, the calendars, the events. */
function useRefreshSources() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of ["sources", "meta", "external-events"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
}

/** The provider's attribution: required wherever its data shows. */
function Attribution({ source }: { source: { name: string; url: string } }) {
  const t = useTranslations("Sources");
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
    >
      {t("attribution", { name: source.name })}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}

/** The wording of a failure code in the person's language; `fallback` when the code is unknown. */
function errorByCode(
  code: string | null | undefined,
  fallback: string,
  t: (key: string) => string,
) {
  return code && (ERROR_CODES as readonly string[]).includes(code) ? t(`errors.${code}`) : fallback;
}

const errorText = (error: unknown, fallback: string, t: (key: string) => string) =>
  errorByCode(error instanceof ApiError ? error.code : null, fallback, t);

/** Connects a source in two steps: check the key, then choose the options and the calendar. */
function ConnectDialog({
  entry,
  existingNames,
  onClose,
}: {
  entry: SourceCatalogEntry | null;
  existingNames: string[];
  onClose: () => void;
}) {
  const t = useTranslations("Sources");
  const common = useTranslations("Common");
  const refresh = useRefreshSources();
  const ui = sourceKindUi(entry?.kind ?? "");
  const [apiKey, setApiKey] = useState("");
  const [config, setConfig] = useState<Config>(ui.defaultConfig);
  const [options, setOptions] = useState<unknown>(null);
  const [verified, setVerified] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]!);

  useEffect(() => {
    if (!entry) return;
    setApiKey("");
    setConfig(sourceKindUi(entry.kind).defaultConfig);
    setOptions(null);
    setVerified(false);
    setName(entry.name);
    setColor(COLORS[0]!);
  }, [entry]);

  const credentials = entry?.needsCredentials ? { apiKey } : {};
  const verify = useMutation({
    mutationFn: () =>
      api<{ options: unknown }>("/api/sources/verify", {
        method: "POST",
        json: { kind: entry!.kind, credentials, config: verifyConfig(config) },
      }),
    onSuccess: (result) => {
      setOptions(result.options);
      setVerified(true);
    },
    onError: (error) => toast.error(errorText(error, common("error"), t)),
  });
  const create = useMutation({
    mutationFn: () =>
      api<SourceDto>("/api/sources", {
        method: "POST",
        json: { kind: entry!.kind, credentials, config, calendar: { name: name.trim(), color } },
      }),
    onSuccess: () => {
      toast.success(t("toasts.connected"));
      refresh();
      onClose();
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 409 ? error.message : common("error"),
      ),
  });

  if (!entry) return null;
  const nameTaken = existingNames.includes(name.trim());
  return (
    <FormDialog
      open
      title={t("connectDialog.title", { name: entry.name })}
      description={t("connectDialog.description")}
      submitLabel={
        verified
          ? create.isPending
            ? t("connectDialog.creating")
            : t("connectDialog.create")
          : verify.isPending
            ? t("connectDialog.verifying")
            : t("connectDialog.verify")
      }
      submitDisabled={
        verified
          ? create.isPending || !name.trim() || nameTaken || !ui.isValid(config)
          : verify.isPending || (entry.needsCredentials && apiKey.trim().length < 8)
      }
      onClose={onClose}
      onSubmit={() => (verified ? create.mutate() : verify.mutate())}
    >
      {!verified ? (
        <>
          {entry.needsCredentials ? (
            <DialogField>
              <Label htmlFor="source-key">{t("connectDialog.apiKey")}</Label>
              <Input
                id="source-key"
                type="password"
                value={apiKey}
                autoComplete="new-password"
                autoCapitalize="off"
                spellCheck={false}
                onChange={(e) => setApiKey(e.target.value.trim())}
              />
              <p className="text-xs text-muted-foreground">{t("connectDialog.apiKeyHelp")}</p>
            </DialogField>
          ) : (
            <p className="text-sm text-muted-foreground">{t("connectDialog.noCredentials")}</p>
          )}
          {ui.SetupFields && <ui.SetupFields config={config} onChange={setConfig} />}
        </>
      ) : (
        <>
          {ui.OptionsFields && (
            <ui.OptionsFields config={config} options={options} onChange={setConfig} />
          )}
          <DialogField>
            <Label htmlFor="source-calendar-name">{t("connectDialog.calendarName")}</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                aria-label={common("color")}
                onChange={(e) => setColor(e.target.value)}
                className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
              />
              <Input
                id="source-calendar-name"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {nameTaken && (
              <p className="text-xs text-destructive">{t("connectDialog.nameTaken")}</p>
            )}
          </DialogField>
        </>
      )}
    </FormDialog>
  );
}

/** What the check may be given of the options: the country is what it asks about. */
const verifyConfig = (config: Config) => (config.country ? { country: config.country } : {});

function ReplaceKeyDialog({
  source,
  name,
  onClose,
}: {
  source: SourceDto | null;
  name: string;
  onClose: () => void;
}) {
  const t = useTranslations("Sources");
  const common = useTranslations("Common");
  const refresh = useRefreshSources();
  const [apiKey, setApiKey] = useState("");
  useEffect(() => setApiKey(""), [source]);
  const save = useMutation({
    mutationFn: () =>
      api(`/api/sources/${source!.id}`, { method: "PATCH", json: { credentials: { apiKey } } }),
    onSuccess: () => {
      toast.success(t("toasts.keyReplaced"));
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorText(error, common("error"), t)),
  });
  if (!source) return null;
  return (
    <FormDialog
      open
      title={t("keyDialog.title", { name })}
      description={t("keyDialog.description")}
      submitLabel={t("keyDialog.save")}
      submitDisabled={save.isPending || apiKey.trim().length < 8}
      onClose={onClose}
      onSubmit={() => save.mutate()}
    >
      <DialogField>
        <Label htmlFor="source-new-key">{t("connectDialog.apiKey")}</Label>
        <Input
          id="source-new-key"
          type="password"
          value={apiKey}
          autoComplete="new-password"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => setApiKey(e.target.value.trim())}
        />
      </DialogField>
    </FormDialog>
  );
}

/** Changes the options of a connected source; the provider's choices are asked again with the stored key. */
function OptionsDialog({
  source,
  name,
  onClose,
}: {
  source: SourceDto | null;
  name: string;
  onClose: () => void;
}) {
  const t = useTranslations("Sources");
  const common = useTranslations("Common");
  const refresh = useRefreshSources();
  const ui = sourceKindUi(source?.kind ?? "");
  const [config, setConfig] = useState<Config>({});
  useEffect(() => setConfig(source?.config ?? {}), [source]);
  const choices = useQuery({
    queryKey: ["sources", "verify", source?.id],
    queryFn: () =>
      api<{ options: unknown }>("/api/sources/verify", {
        method: "POST",
        json: { sourceId: source!.id },
      }),
    enabled: Boolean(source) && Boolean(ui.OptionsFields),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const save = useMutation({
    mutationFn: () => api(`/api/sources/${source!.id}`, { method: "PATCH", json: { config } }),
    onSuccess: () => {
      toast.success(t("toasts.optionsSaved"));
      refresh();
      onClose();
    },
    onError: (error) => toast.error(errorText(error, common("error"), t)),
  });
  if (!source) return null;
  return (
    <FormDialog
      open
      title={t("optionsDialog.title", { name })}
      description={t("optionsDialog.description")}
      submitLabel={common("save")}
      submitDisabled={save.isPending || choices.isLoading || choices.isError || !ui.isValid(config)}
      onClose={onClose}
      onSubmit={() => save.mutate()}
    >
      {choices.isLoading && (
        <p className="text-sm text-muted-foreground">{t("optionsDialog.loading")}</p>
      )}
      {choices.isError && (
        <p className="text-sm text-destructive">{errorText(choices.error, common("error"), t)}</p>
      )}
      {ui.OptionsFields && !choices.isLoading && !choices.isError && (
        <ui.OptionsFields
          config={config}
          options={choices.data?.options ?? null}
          onChange={setConfig}
        />
      )}
    </FormDialog>
  );
}

function DisconnectDialog({
  source,
  name,
  pending,
  onCancel,
  onConfirm,
}: {
  source: SourceDto | null;
  name: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("Sources");
  const common = useTranslations("Common");
  return (
    <Dialog open={Boolean(source)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("disconnectDialog.title", { name })}</DialogTitle>
          <DialogDescription>{t("disconnectDialog.help")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {common("cancel")}
          </Button>
          <Button variant="destructive" disabled={pending} onClick={onConfirm}>
            {t("disconnectDialog.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_STYLE: Record<SourceDto["status"], string> = {
  active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  paused: "bg-muted text-muted-foreground",
  error: "bg-destructive/15 text-destructive",
  key_needed: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

function SourceRow({
  source,
  entry,
  meta,
  onKey,
  onOptions,
  onDisconnect,
}: {
  source: SourceDto;
  entry: SourceCatalogEntry | undefined;
  meta: Meta;
  onKey: () => void;
  onOptions: () => void;
  onDisconnect: () => void;
}) {
  const t = useTranslations("Sources");
  const common = useTranslations("Common");
  const locale = useLocale();
  const refresh = useRefreshSources();
  const calendar = meta.calendars.find((c) => c.id === source.calendarId);
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: meta.workspace.timeZone,
    }).format(new Date(iso));

  const syncNow = useMutation({
    mutationFn: () => api<SourceDto>(`/api/sources/${source.id}/sync`, { method: "POST" }),
    onSuccess: (result) => {
      refresh();
      if (result.lastSyncError) {
        toast.error(errorByCode(result.lastSyncErrorCode, result.lastSyncError, t));
      } else toast.success(t("toasts.updated"));
    },
    onError: () => toast.error(common("error")),
  });
  const toggle = useMutation({
    mutationFn: () =>
      api(`/api/sources/${source.id}`, {
        method: "PATCH",
        json: { enabled: source.status === "paused" },
      }),
    onSuccess: () => {
      toast.success(source.status === "paused" ? t("toasts.resumed") : t("toasts.paused"));
      refresh();
    },
    onError: () => toast.error(common("error")),
  });

  const paused = source.status === "paused";
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-3" data-testid="source-row">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="size-3 shrink-0 rounded-full"
          style={{ backgroundColor: calendar?.color }}
          aria-hidden
        />
        <span className="font-medium">{calendar?.name ?? entry?.name}</span>
        <span className="text-xs text-muted-foreground">{entry?.name}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[source.status]}`}
          data-testid="source-status"
        >
          {t(`status.${source.status}`)}
        </span>
      </div>
      <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
        <span>
          {source.lastSyncAt
            ? t("lastUpdate", { date: when(source.lastSyncAt) })
            : t("neverUpdated")}
          {source.nextSyncAt &&
            !paused &&
            ` · ${t("nextUpdate", { date: when(source.nextSyncAt) })}`}
        </span>
        {source.usage && (
          <span>
            {source.usage.resumesAt
              ? t("usageResumes", { date: when(source.usage.resumesAt) })
              : t("usage", { used: source.usage.used, limit: source.usage.limit })}
          </span>
        )}
        {source.secretHint && <span>{t("keyHint", { hint: source.secretHint })}</span>}
      </div>
      {source.lastSyncError && (
        <p className="text-sm text-destructive" role="alert">
          {errorByCode(source.lastSyncErrorCode, source.lastSyncError, t)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={paused || syncNow.isPending}
          onClick={() => syncNow.mutate()}
        >
          <RefreshCw className={syncNow.isPending ? "animate-spin" : undefined} />
          {syncNow.isPending ? t("actions.updating") : t("actions.updateNow")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate()}
        >
          {paused ? <Play /> : <Pause />}
          {paused ? t("actions.resume") : t("actions.pause")}
        </Button>
        {entry?.needsCredentials && (
          <Button variant="outline" size="sm" onClick={onKey}>
            {t("actions.replaceKey")}
          </Button>
        )}
        {sourceKindUi(source.kind).OptionsFields && (
          <Button variant="outline" size="sm" onClick={onOptions}>
            <Settings2 /> {t("actions.options")}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDisconnect}>
          <Unplug /> {t("actions.disconnect")}
        </Button>
        {entry && (
          <span className="ml-auto">
            <Attribution source={entry.attribution} />
          </span>
        )}
      </div>
    </li>
  );
}

/** Settings → Sources: the catalog of providers an admin can connect, and the ones already connected. */
export function SourcesSection({ meta }: { meta: Meta }) {
  const t = useTranslations("Sources");
  const refresh = useRefreshSources();
  const list = useQuery({
    queryKey: ["sources"],
    queryFn: () => api<SourceListDto>("/api/sources"),
  });
  const [connecting, setConnecting] = useState<SourceCatalogEntry | null>(null);
  const [replacingKey, setReplacingKey] = useState<SourceDto | null>(null);
  const [editing, setEditing] = useState<SourceDto | null>(null);
  const [disconnecting, setDisconnecting] = useState<SourceDto | null>(null);
  const disconnect = useMutation({
    mutationFn: (id: string) => api(`/api/sources/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t("toasts.disconnected"));
      refresh();
      setDisconnecting(null);
    },
  });

  const catalog = list.data?.catalog ?? [];
  const sources = list.data?.sources ?? [];
  const entryOf = (kind: string) => catalog.find((c) => c.kind === kind);
  const nameOf = (source: SourceDto | null) =>
    (source && meta.calendars.find((c) => c.id === source.calendarId)?.name) ?? "";

  return (
    <SectionCard title={t("title")} help={t("help")} contentClassName="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t("catalogTitle")}</h3>
        <ul className="flex flex-col gap-2">
          {catalog.map((entry) => (
            <li
              key={entry.kind}
              className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              data-testid="source-catalog-entry"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-medium">{entry.name}</span>
                <span className="text-sm text-muted-foreground">
                  {t.has(`kinds.${entry.kind}.description`)
                    ? t(`kinds.${entry.kind}.description`)
                    : null}
                </span>
                <Attribution source={entry.attribution} />
              </div>
              <Button onClick={() => setConnecting(entry)}>{t("connect")}</Button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{t("connectedTitle")}</h3>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noneConnected")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sources.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                entry={entryOf(source.kind)}
                meta={meta}
                onKey={() => setReplacingKey(source)}
                onOptions={() => setEditing(source)}
                onDisconnect={() => setDisconnecting(source)}
              />
            ))}
          </ul>
        )}
      </div>
      <ConnectDialog
        entry={connecting}
        existingNames={meta.calendars.map((c) => c.name)}
        onClose={() => setConnecting(null)}
      />
      <ReplaceKeyDialog
        source={replacingKey}
        name={nameOf(replacingKey)}
        onClose={() => setReplacingKey(null)}
      />
      <OptionsDialog source={editing} name={nameOf(editing)} onClose={() => setEditing(null)} />
      <DisconnectDialog
        source={disconnecting}
        name={nameOf(disconnecting)}
        pending={disconnect.isPending}
        onCancel={() => setDisconnecting(null)}
        onConfirm={() => disconnect.mutate(disconnecting!.id)}
      />
    </SectionCard>
  );
}
