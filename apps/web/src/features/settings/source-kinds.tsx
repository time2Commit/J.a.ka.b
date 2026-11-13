"use client";

import {
  STREAMING_RELEASES_KIND,
  type StreamingReleasesConfig,
  type StreamingReleasesVerifyOptions,
} from "@jakab/shared";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

type Config = Record<string, unknown>;

/** What the connect and options dialogs need to know about one kind of source. */
export interface SourceKindUi {
  defaultConfig: Config;
  /** Fields asked together with the key, before it is checked (they shape what the check asks). */
  SetupFields?: ComponentType<{ config: Config; onChange: (config: Config) => void }>;
  /** The options chosen after the check, from what the provider offered. */
  OptionsFields?: ComponentType<{
    config: Config;
    options: unknown;
    onChange: (config: Config) => void;
  }>;
  isValid: (config: Config) => boolean;
}

const asStreaming = (config: Config) => config as unknown as StreamingReleasesConfig;

function StreamingSetup({
  config,
  onChange,
}: {
  config: Config;
  onChange: (config: Config) => void;
}) {
  const t = useTranslations(`Sources.kinds.${STREAMING_RELEASES_KIND}`);
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="source-country">{t("country")}</Label>
      <Input
        id="source-country"
        value={asStreaming(config).country ?? ""}
        maxLength={2}
        autoComplete="off"
        className="max-w-24"
        onChange={(e) => onChange({ ...config, country: e.target.value.toLowerCase() })}
      />
      <p className="text-xs text-muted-foreground">{t("countryHelp")}</p>
    </div>
  );
}

function StreamingOptions({
  config,
  options,
  onChange,
}: {
  config: Config;
  options: unknown;
  onChange: (config: Config) => void;
}) {
  const t = useTranslations(`Sources.kinds.${STREAMING_RELEASES_KIND}`);
  const current = asStreaming(config);
  const offered = (options as StreamingReleasesVerifyOptions | null)?.services ?? [];
  // A service followed before the provider stopped listing it stays visible, so it can be unchecked.
  const known = new Set(offered.map((s) => s.id));
  const services = [
    ...offered,
    ...(current.services ?? []).filter((id) => !known.has(id)).map((id) => ({ id, name: id })),
  ];
  const toggle = (id: string) => {
    const set = new Set(current.services ?? []);
    if (!set.delete(id)) set.add(id);
    onChange({ ...config, services: [...set] });
  };
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("services")}</legend>
        <p className="text-xs text-muted-foreground">{t("servicesHelp")}</p>
        {services.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("noServices")}</p>
        )}
        <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
          {services.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={(current.services ?? []).includes(s.id)}
                onChange={() => toggle(s.id)}
              />
              <span className="truncate">{s.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={current.subscriptionOnly ?? true}
          onChange={(e) => onChange({ ...config, subscriptionOnly: e.target.checked })}
        />
        {t("subscriptionOnly")}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="source-show-type">{t("showType")}</Label>
          <Select
            id="source-show-type"
            value={current.showType ?? "both"}
            onChange={(e) => onChange({ ...config, showType: e.target.value })}
          >
            {(["both", "movie", "series"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`showTypes.${v}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="source-changes">{t("changes")}</Label>
          <Select
            id="source-changes"
            value={current.changes ?? "both"}
            onChange={(e) => onChange({ ...config, changes: e.target.value })}
          >
            {(["both", "new", "upcoming"] as const).map((v) => (
              <option key={v} value={v}>
                {t(`changeKinds.${v}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </>
  );
}

const KINDS: Record<string, SourceKindUi> = {
  [STREAMING_RELEASES_KIND]: {
    defaultConfig: {
      country: "it",
      services: [],
      subscriptionOnly: true,
      showType: "both",
      changes: "both",
    },
    SetupFields: StreamingSetup,
    OptionsFields: StreamingOptions,
    isValid: (config) =>
      /^[a-z]{2}$/.test(asStreaming(config).country ?? "") &&
      (asStreaming(config).services ?? []).length > 0,
  },
};

/** A kind with no screen of its own has no options to choose: it connects with an empty config. */
const FALLBACK: SourceKindUi = { defaultConfig: {}, isValid: () => true };

export const sourceKindUi = (kind: string): SourceKindUi => KINDS[kind] ?? FALLBACK;
