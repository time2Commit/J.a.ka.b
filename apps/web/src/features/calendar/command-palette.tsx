"use client";

import { Command } from "cmdk";
import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { ProjectSuggestion, Status } from "@/lib/types";
import { useProjectSuggestions } from "./use-project-suggestions";

/** Quick project search (⌘K / Ctrl+K). */
export function CommandPalette({
  open,
  onOpenChange,
  statuses,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  statuses: Status[];
  onSelect: (project: ProjectSuggestion) => void;
}) {
  const t = useTranslations("Calendar");
  const [query, setQuery] = useState("");
  const suggestions = useProjectSuggestions(query, open);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQuery("");
        onOpenChange(next);
      }}
    >
      <DialogContent className="top-[20%] translate-y-0 gap-0 p-0">
        <DialogTitle className="sr-only">{t("search")}</DialogTitle>
        <Command shouldFilter={false} label={t("search")}>
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="h-12 w-full border-b bg-transparent px-4 pr-10 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-72 overflow-y-auto p-1">
            <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t("searchEmpty")}
            </Command.Empty>
            {(suggestions.data ?? []).map((p) => {
              const status = statuses.find((s) => s.id === p.statusId);
              return (
                <Command.Item
                  key={p.id}
                  value={p.id}
                  onSelect={() => onSelect(p)}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {status && <Badge color={status.color}>{status.name}</Badge>}
                </Command.Item>
              );
            })}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
