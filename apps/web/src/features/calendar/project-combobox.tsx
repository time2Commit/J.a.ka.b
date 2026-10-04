"use client";

import { normalizeProjectName } from "@jakab/shared";
import { Command } from "cmdk";
import { FolderPlus, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { Status } from "@/lib/types";
import { useProjectSuggestions } from "./use-project-suggestions";

export type ProjectChoice =
  { kind: "existing"; id: string; name: string } | { kind: "new"; name: string } | null;

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground";

/** Type to search existing projects (typo tolerant) or to create a new one. */
export function ProjectCombobox({
  value,
  onChange,
  statuses,
}: {
  value: ProjectChoice;
  onChange: (choice: ProjectChoice) => void;
  statuses: Status[];
}) {
  const t = useTranslations("Card");
  const format = useFormatter();
  const [query, setQuery] = useState("");
  const suggestions = useProjectSuggestions(query, value === null);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{value.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {value.kind === "new" ? t("willCreate") : t("willLink")}
          </span>
        </span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
          }}
          aria-label={t("changeProject")}
          className="rounded-sm opacity-70 hover:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const trimmed = query.trim();
  const items = suggestions.data ?? [];
  const exact = items.some((s) => normalizeProjectName(s.name) === normalizeProjectName(trimmed));

  return (
    <Command shouldFilter={false} label={t("projectName")} className="rounded-md border">
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder={t("projectSearch")}
        aria-label={t("projectName")}
        maxLength={120}
        autoFocus
        className="h-9 w-full rounded-t-md border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="max-h-56 overflow-y-auto p-1">
        <Command.Empty className="px-2 py-3 text-center text-sm text-muted-foreground">
          {t("noProjects")}
        </Command.Empty>
        {items.length > 0 && (
          <Command.Group
            heading={trimmed ? t("suggestions") : t("recent")}
            className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
          >
            {items.map((s) => {
              const status = statuses.find((x) => x.id === s.statusId);
              return (
                <Command.Item
                  key={s.id}
                  value={s.id}
                  className={itemClass}
                  onSelect={() => onChange({ kind: "existing", id: s.id, name: s.name })}
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {status && <Badge color={status.color}>{status.name}</Badge>}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {s.lastCardEnd
                      ? t("lastCard", {
                          date: format.dateTime(new Date(s.lastCardEnd), { dateStyle: "medium" }),
                        })
                      : t("noCards")}
                  </span>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}
        {trimmed && !exact && (
          <Command.Group>
            <Command.Item
              value="__create__"
              className={itemClass}
              onSelect={() => onChange({ kind: "new", name: trimmed })}
            >
              <FolderPlus className="size-4" />
              {t("createProject", { name: trimmed })}
            </Command.Item>
          </Command.Group>
        )}
      </Command.List>
    </Command>
  );
}
