"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Command } from "cmdk";
import { FileStack, FileText, Search, TextSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { folderPathNames } from "@/features/folders/tree";
import { api } from "@/lib/api";
import type { Folder, SearchResults } from "@/lib/types";

/** Debounced search over project names and note texts. */
function useGlobalSearch(query: string, enabled: boolean) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timer);
  }, [query]);
  return useQuery({
    queryKey: ["projects", "search", debounced.trim()],
    queryFn: () => api<SearchResults>(`/api/search?q=${encodeURIComponent(debounced.trim())}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}

const ITEM =
  "flex cursor-pointer items-start gap-2 rounded-sm px-2 py-2 text-sm outline-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground";

const GROUP =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

/** An excerpt of a text with the words found highlighted. */
function Excerpt({ snippet }: { snippet: { before: string; match: string; after: string } }) {
  return (
    <span className="mt-0.5 line-clamp-2 text-xs break-words text-muted-foreground">
      {snippet.before}
      <mark className="rounded-sm bg-yellow-300/60 px-0.5 text-foreground dark:bg-yellow-500/40">
        {snippet.match}
      </mark>
      {snippet.after}
    </span>
  );
}

function Where({ path }: { path: string }) {
  return path ? <span className="block truncate text-xs text-muted-foreground">{path}</span> : null;
}

/** Search box in the header: finds a project by name (typos included) and opens its note. */
export function GlobalSearch() {
  const t = useTranslations("Search");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const typed = query.trim() !== "";
  const results = useGlobalSearch(query, typed);
  const folders = useQuery({
    queryKey: ["projects", "folders"],
    queryFn: () => api<Folder[]>("/api/folders?kind=project"),
    enabled: open && typed,
  });
  const templateFolders = useQuery({
    queryKey: ["templates", "folders"],
    queryFn: () => api<Folder[]>("/api/folders?kind=template"),
    enabled: open && typed,
  });

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    router.push(href);
  }

  const projects = results.data?.projects ?? [];
  const notes = results.data?.notes ?? [];
  const templates = results.data?.templates ?? [];
  const nothing = projects.length === 0 && notes.length === 0 && templates.length === 0;
  const where = (folderId: string | null) =>
    folderPathNames(folders.data ?? [], folderId).join(" / ");

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
            className="h-9 w-36 rounded-md border border-input bg-background pr-3 pl-8 text-sm shadow-xs transition-[width] outline-none placeholder:text-muted-foreground focus:w-48 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:w-56 sm:focus:w-80"
          />
        </div>
        {open && typed && (
          <Command.List className="absolute right-0 z-50 mt-1 max-h-80 w-72 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md sm:w-80">
            {nothing && !results.isFetching ? (
              <Command.Empty className="px-2 py-4 text-center text-sm text-muted-foreground">
                {t("empty")}
              </Command.Empty>
            ) : null}
            {projects.length > 0 && (
              <Command.Group heading={t("projects")} className={GROUP}>
                {projects.map((p) => (
                  <Command.Item
                    key={`p-${p.id}`}
                    value={`p-${p.id}`}
                    onSelect={() => go(`/projects/${p.id}`)}
                    className={ITEM}
                  >
                    <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{p.name}</span>
                      <Where path={where(p.folderId)} />
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {notes.length > 0 && (
              <Command.Group heading={t("notes")} className={GROUP}>
                {notes.map((n) => (
                  <Command.Item
                    key={`n-${n.id}`}
                    value={`n-${n.id}`}
                    onSelect={() => go(`/projects/${n.id}`)}
                    className={ITEM}
                  >
                    <TextSearch className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{n.name}</span>
                      <Where path={where(n.folderId)} />
                      <Excerpt snippet={n.snippet} />
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
            {templates.length > 0 && (
              <Command.Group heading={t("templates")} className={GROUP}>
                {templates.map((tpl) => (
                  <Command.Item
                    key={`t-${tpl.id}`}
                    value={`t-${tpl.id}`}
                    onSelect={() => go(`/templates/${tpl.id}`)}
                    className={ITEM}
                  >
                    <FileStack className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{tpl.name}</span>
                      <Where
                        path={folderPathNames(templateFolders.data ?? [], tpl.folderId).join(" / ")}
                      />
                      {tpl.snippet && <Excerpt snippet={tpl.snippet} />}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        )}
      </Command>
    </div>
  );
}
