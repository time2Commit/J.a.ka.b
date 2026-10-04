"use client";

import type { DatesSetArg, EventDropArg, EventInput, DateSelectArg } from "@fullcalendar/core";
import type { DropArg } from "@fullcalendar/interaction";
import itLocale from "@fullcalendar/core/locales/it";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin, { type EventResizeDoneArg } from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import luxon3Plugin from "@fullcalendar/luxon3";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { CardDto, Meta, ProjectSuggestion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CardContent } from "./card-content";
import { CardPanel } from "./card-panel";
import { CommandPalette } from "./command-palette";
import { emptyFilters, FilterBar, type Filters } from "./filters";
import { NewCardDialog } from "./new-card-dialog";
import { ToSchedulePanel } from "./to-schedule-panel";
import { defaultDraft, dropToRange, eventToRange, selectionToDraft, type Draft } from "./time";
import { useBoardEvents } from "./use-board-events";

const PLUGINS = [dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin, luxon3Plugin];
const LOCALES = [itLocale];

const VIEWS = ["timeGridDay", "timeGridWeek", "dayGridMonth", "listWeek"] as const;
type View = (typeof VIEWS)[number];
const VIEW_LABEL: Record<View, "day" | "week" | "month" | "list"> = {
  timeGridDay: "day",
  timeGridWeek: "week",
  dayGridMonth: "month",
  listWeek: "list",
};

interface Range {
  from: string;
  to: string;
}
interface Patch {
  id: string;
  start: string;
  end: string;
  allDay: boolean;
}

export function Board() {
  const t = useTranslations("Calendar");
  const common = useTranslations("Common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const calendarRef = useRef<FullCalendar>(null);

  useBoardEvents();

  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });

  const [range, setRange] = useState<Range | null>(null);
  const [title, setTitle] = useState("");
  const [view, setView] = useState<View>("timeGridWeek");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; draft: Draft | null }>({
    open: false,
    draft: null,
  });

  const cards = useQuery({
    queryKey: ["cards", range?.from, range?.to],
    queryFn: () => api<CardDto[]>(`/api/cards?from=${range!.from}&to=${range!.to}`),
    enabled: Boolean(range),
    placeholderData: keepPreviousData,
  });

  const visible = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return (cards.data ?? []).filter(
      (c) =>
        (!search ||
          c.projectName.toLowerCase().includes(search) ||
          c.title?.toLowerCase().includes(search)) &&
        (!filters.statusId || c.status.id === filters.statusId) &&
        (!filters.labelId || c.labels.some((l) => l.id === filters.labelId)) &&
        (!filters.memberId || c.memberIds.includes(filters.memberId)),
    );
  }, [cards.data, filters]);

  const events: EventInput[] = useMemo(
    () =>
      visible.map((c) => ({
        id: c.id,
        title: c.projectName,
        start: c.start,
        end: c.end,
        allDay: c.allDay,
        backgroundColor: `color-mix(in oklab, ${c.status.color} 16%, var(--card))`,
        borderColor: c.status.color,
        textColor: "var(--card-foreground)",
        extendedProps: { card: c },
      })),
    [visible],
  );

  const workspace = meta.data?.workspace;
  const businessHours = useMemo(
    () => ({
      startTime: workspace?.workDayStart ?? "08:00",
      endTime: workspace?.workDayEnd ?? "19:00",
    }),
    [workspace?.workDayStart, workspace?.workDayEnd],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const schedule = useMutation({
    mutationFn: (body: { projectId: string; start: string; end: string; allDay: boolean }) =>
      api("/api/cards", { method: "POST", json: body }),
    onSuccess: () => {
      toast.success(t("scheduled"));
      void queryClient.invalidateQueries({ queryKey: ["cards"] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: () => toast.error(t("moveFailed")),
  });

  function onDrop(info: DropArg) {
    const projectId = info.draggedEl.dataset.projectId;
    if (projectId) schedule.mutate({ projectId, ...dropToRange(info.dateStr, info.allDay) });
  }

  function onPaletteSelect(project: ProjectSuggestion) {
    setPaletteOpen(false);
    if (!project.focusCard) {
      toast.info(t("searchNoCards"));
      return;
    }
    api_()?.gotoDate(new Date(project.focusCard.start));
    setSelectedId(project.focusCard.id);
  }

  const move = useMutation({
    mutationFn: ({ id, ...body }: Patch) =>
      api<CardDto>(`/api/cards/${id}`, { method: "PATCH", json: body }),
    onMutate: async ({ id, ...body }) => {
      await queryClient.cancelQueries({ queryKey: ["cards"] });
      queryClient.setQueriesData<CardDto[]>({ queryKey: ["cards"] }, (old) =>
        old?.map((c) => (c.id === id ? { ...c, ...body } : c)),
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["cards"] }),
  });

  function applyChange(info: EventDropArg | EventResizeDoneArg, message: string) {
    const next = eventToRange(info.event);
    const prev = eventToRange(info.oldEvent);
    const id = info.event.id;
    move.mutate(
      { id, ...next },
      {
        onSuccess: () =>
          toast(message, {
            action: { label: common("undo"), onClick: () => move.mutate({ id, ...prev }) },
          }),
        onError: () => {
          info.revert();
          toast.error(t("moveFailed"));
        },
      },
    );
  }

  function openNew(draft: Draft) {
    setDialog({ open: true, draft });
  }

  function onSelect(info: DateSelectArg) {
    if (!meta.data) return;
    openNew(
      selectionToDraft(info.startStr, info.endStr, info.allDay, meta.data.workspace.timeZone),
    );
    calendarRef.current?.getApi().unselect();
  }

  function onDatesSet(arg: DatesSetArg) {
    setTitle(arg.view.title);
    setView(arg.view.type as View);
    const next = { from: arg.start.toISOString(), to: arg.end.toISOString() };
    setRange((prev) => (prev?.from === next.from && prev.to === next.to ? prev : next));
  }

  if (meta.isLoading || !meta.data) {
    return <p className="text-muted-foreground">{common("loading")}</p>;
  }
  const m = meta.data;
  const api_ = () => calendarRef.current?.getApi();
  const selected = cards.data?.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous"
            onClick={() => api_()?.prev()}
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" size="icon" aria-label="Next" onClick={() => api_()?.next()}>
            <ChevronRight />
          </Button>
          <Button variant="outline" onClick={() => api_()?.today()}>
            {t("today")}
          </Button>
          <h1 className="ml-2 text-lg font-semibold tracking-tight capitalize" aria-live="polite">
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" className="flex rounded-md border">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => api_()?.changeView(v)}
                className={cn(
                  "px-3 py-1.5 text-sm first:rounded-l-md last:rounded-r-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  view === v ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/50",
                )}
              >
                {t(`views.${VIEW_LABEL[v]}`)}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={() => setPaletteOpen(true)}>
            <Search /> {t("search")}
            <kbd className="ml-1 hidden rounded border px-1 text-[10px] text-muted-foreground sm:inline">
              ⌘K
            </kbd>
          </Button>
          <Button onClick={() => openNew(defaultDraft(new Date(), m.workspace.timeZone))}>
            <Plus /> {t("newCard")}
          </Button>
        </div>
      </div>

      <FilterBar meta={m} value={filters} onChange={setFilters} />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="jakab-calendar rounded-xl border bg-card p-2">
          <FullCalendar
            ref={calendarRef}
            plugins={PLUGINS}
            initialView={
              typeof window !== "undefined" && window.innerWidth < 768
                ? "timeGridDay"
                : "timeGridWeek"
            }
            headerToolbar={false}
            height="auto"
            timeZone={m.workspace.timeZone}
            locales={LOCALES}
            locale={locale}
            firstDay={m.workspace.firstDayOfWeek}
            scrollTime={`${m.workspace.workDayStart}:00`}
            businessHours={businessHours}
            nowIndicator
            editable
            selectable
            selectMirror
            droppable
            drop={onDrop}
            forceEventDuration
            defaultTimedEventDuration="01:00"
            dayMaxEvents
            allDayText={t("allDay")}
            noEventsText={t("noEvents")}
            events={events}
            datesSet={onDatesSet}
            select={onSelect}
            eventClick={(info) => setSelectedId(info.event.id)}
            eventDrop={(info) => applyChange(info, t("moved"))}
            eventResize={(info) => applyChange(info, t("resized"))}
            eventContent={(arg) => {
              const card = arg.event.extendedProps.card as CardDto | undefined;
              if (!card) return undefined;
              return (
                <CardContent
                  card={card}
                  users={m.users}
                  compact={
                    arg.view.type === "dayGridMonth" ||
                    arg.view.type === "listWeek" ||
                    arg.event.allDay
                  }
                />
              );
            }}
          />
        </div>
        <ToSchedulePanel statuses={m.statuses} />
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        statuses={m.statuses}
        onSelect={onPaletteSelect}
      />
      <NewCardDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        draft={dialog.draft ?? defaultDraft(new Date(), m.workspace.timeZone)}
        timeZone={m.workspace.timeZone}
        statuses={m.statuses}
      />
      <CardPanel card={selected} meta={m} onClose={() => setSelectedId(null)} />
    </div>
  );
}
