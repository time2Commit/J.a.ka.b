"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { ProjectSuggestion } from "@/lib/types";

/** Debounced project suggestions (server ranks them: prefix, contains, similar). */
export function useProjectSuggestions(query: string, enabled = true) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timer);
  }, [query]);
  return useQuery({
    queryKey: ["projects", "suggest", debounced.trim()],
    queryFn: () =>
      api<ProjectSuggestion[]>(`/api/projects/suggest?q=${encodeURIComponent(debounced.trim())}`),
    enabled,
    placeholderData: keepPreviousData,
  });
}
