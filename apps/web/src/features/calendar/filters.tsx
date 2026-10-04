"use client";

import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { Meta } from "@/lib/types";

export interface Filters {
  search: string;
  statusId: string;
  labelId: string;
  memberId: string;
}

export const emptyFilters: Filters = { search: "", statusId: "", labelId: "", memberId: "" };

export function FilterBar({
  meta,
  value,
  onChange,
}: {
  meta: Meta;
  value: Filters;
  onChange: (next: Filters) => void;
}) {
  const t = useTranslations("Calendar.filters");
  const active = JSON.stringify(value) !== JSON.stringify(emptyFilters);
  const set = (patch: Partial<Filters>) => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-40 flex-1 sm:max-w-64">
        <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          value={value.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder={t("search")}
          aria-label={t("search")}
          className="pl-8"
        />
      </div>
      <Select
        className="w-auto"
        aria-label={t("status")}
        value={value.statusId}
        onChange={(e) => set({ statusId: e.target.value })}
      >
        <option value="">{t("allStatuses")}</option>
        {meta.statuses.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <Select
        className="w-auto"
        aria-label={t("label")}
        value={value.labelId}
        onChange={(e) => set({ labelId: e.target.value })}
      >
        <option value="">{t("allLabels")}</option>
        {meta.labels.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </Select>
      <Select
        className="w-auto"
        aria-label={t("member")}
        value={value.memberId}
        onChange={(e) => set({ memberId: e.target.value })}
      >
        <option value="">{t("allMembers")}</option>
        {meta.users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </Select>
      {active && (
        <Button variant="ghost" size="sm" onClick={() => onChange(emptyFilters)}>
          <X /> {t("reset")}
        </Button>
      )}
    </div>
  );
}
