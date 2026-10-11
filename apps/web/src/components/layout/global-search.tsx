"use client";

import { useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { FileText, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useProjectSuggestions } from "@/features/calendar/use-project-suggestions";
import { folderPathNames } from "@/features/projects/tree";
import { api } from "@/lib/api";
import type { Folder } from "@/lib/types";

/** Search box in the header: finds a project by name (typos included) and opens its note. */
export function GlobalSearch() {
  const t = useTranslations("Search");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const typed = query.trim() !== "";
  const results = useProjectSuggestions(query, typed);
  const folders = useQuery({
    queryKey: ["projects", "folders"],
    queryFn: () => api<Folder[]>("/api/folders"),
    enabled: open && typed,
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function go(id: string) {
    setOpen(false);
    setQuery("");
    router.push(`/projects/${id}`);
  }

  const items = results.data ?? [];
  return (
    <div ref={root} className="relative">
      <Command
        shouldFilter={false}
        label={t("label")}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Command.Input
            value={query}
            onValueChange={(value) => {
              setQuery(value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            placeholder={t("placeholder")}
            aria-label={t("label")}
            className="h-9 w-36 rounded-md border border-input bg-background pr-3 pl-8 text-sm shadow-xs transition-[width] outline-none placeholder:text-muted-foreground focus:w-48 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-48 sm:focus:w-72"
          />
        </div>
        {open && typed && (
          <Command.List className="absolute right-0 z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md sm:w-80">
            {items.length === 0 && !results.isFetching ? (
              <Command.Empty className="px-2 py-4 text-center text-sm text-muted-foreground">
                {t("empty")}
              </Command.Empty>
            ) : null}
            {items.map((p) => {
              const path = folderPathNames(folders.data ?? [], p.folderId ?? null).join(" / ");
              return (
                <Command.Item
                  key={p.id}
                  value={p.id}
                  onSelect={() => go(p.id)}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{p.name}</span>
                    {path && (
                      <span className="block truncate text-xs text-muted-foreground">{path}</span>
                    )}
                  </span>
                </Command.Item>
              );
            })}
          </Command.List>
        )}
      </Command>
    </div>
  );
}
