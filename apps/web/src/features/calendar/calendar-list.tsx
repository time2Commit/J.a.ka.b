"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CloudDownload, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";
import type { Meta } from "@/lib/types";

/**
 * The calendars of the workspace, each with a checkbox to show or hide its cards. Hiding is a
 * personal choice saved on the person's account, so it follows them across devices.
 */
export function CalendarList({ meta }: { meta: Meta }) {
  const t = useTranslations("Calendar");
  const queryClient = useQueryClient();
  const hidden = new Set(meta.preferences.hiddenCalendarIds);

  const save = useMutation({
    mutationFn: (hiddenCalendarIds: string[]) =>
      api("/api/me/preferences", { method: "PATCH", json: { hiddenCalendarIds } }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["meta"] }),
  });

  function toggle(id: string) {
    const next = new Set(hidden);
    if (!next.delete(id)) next.add(id);
    const hiddenCalendarIds = [...next];
    // A refresh already under way must not bring the old choice back over this one.
    void queryClient.cancelQueries({ queryKey: ["meta"] }, { revert: false });
    // Applied in the same event as the click, so the checkbox never flickers back.
    queryClient.setQueryData<Meta>(
      ["meta"],
      (old) => old && { ...old, preferences: { ...old.preferences, hiddenCalendarIds } },
    );
    save.mutate(hiddenCalendarIds);
  }

  return (
    <section
      aria-label={t("calendars")}
      className="flex flex-col gap-2 rounded-xl border bg-card p-3"
    >
      <h2 className="text-sm font-semibold">{t("calendars")}</h2>
      <ul className="flex flex-col gap-1">
        {meta.calendars.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!hidden.has(c.id)}
                onChange={() => toggle(c.id)}
                style={{ accentColor: c.color }}
              />
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
              <span className="truncate">{c.name}</span>
              {c.source && (
                <CloudDownload
                  className="size-3.5 shrink-0 text-muted-foreground"
                  aria-label={t("sourceCalendar")}
                />
              )}
              {c.source?.failed && (
                <TriangleAlert
                  className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-label={t("sourceFailed")}
                />
              )}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
