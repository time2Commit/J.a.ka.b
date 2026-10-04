"use client";

import { Draggable } from "@fullcalendar/interaction";
import { useQuery } from "@tanstack/react-query";
import { GripVertical } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { ProjectListItem, Status } from "@/lib/types";

/** Projects without upcoming cards. Each item can be dragged onto the calendar. */
export function ToSchedulePanel({ statuses }: { statuses: Status[] }) {
  const t = useTranslations("Calendar");
  const format = useFormatter();
  const listRef = useRef<HTMLUListElement>(null);

  const projects = useQuery({
    queryKey: ["projects", "unscheduled"],
    queryFn: () => api<ProjectListItem[]>("/api/projects/unscheduled"),
  });

  useEffect(() => {
    if (!listRef.current) return;
    const draggable = new Draggable(listRef.current, {
      itemSelector: "[data-project-id]",
      // `create: false`: the calendar only reports the drop, the board creates the card.
      eventData: (el) => ({ title: el.dataset.projectName, duration: "01:00", create: false }),
    });
    return () => draggable.destroy();
  }, []);

  const items = projects.data ?? [];
  return (
    <aside
      aria-label={t("toSchedule")}
      className="flex flex-col gap-2 rounded-xl border bg-card p-3"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("toSchedule")}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums">
          {items.length}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {items.length > 0 ? t("toScheduleHelp") : t("toScheduleEmpty")}
      </p>
      <ul ref={listRef} className="flex max-h-[60svh] flex-col gap-1.5 overflow-y-auto">
        {items.map((p) => {
          const status = statuses.find((s) => s.id === p.statusId);
          return (
            <li
              key={p.id}
              data-project-id={p.id}
              data-project-name={p.name}
              className="flex cursor-grab items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm active:cursor-grabbing"
            >
              <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{p.name}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {status && <Badge color={status.color}>{status.name}</Badge>}
                  <span className="tabular-nums">{p.progress}%</span>
                  {p.lastCardEnd && (
                    <span className="truncate">
                      · {format.dateTime(new Date(p.lastCardEnd), { dateStyle: "short" })}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
