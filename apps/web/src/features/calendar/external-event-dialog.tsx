"use client";

import type { ExternalEventDto, StreamingReleaseDetails } from "@jakab/shared";
import { STREAMING_RELEASES_KIND, streamingReleaseDetailsSchema } from "@jakab/shared";
import { ExternalLink } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Calendar } from "@/lib/types";

/** The facts of a streaming arrival, as plain text (nothing the provider sent is ever HTML). */
function StreamingDetails({ details }: { details: StreamingReleaseDetails }) {
  const t = useTranslations("Calendar.external");
  return (
    <ul className="flex flex-col gap-1 text-sm">
      <li>
        {t(details.type)}
        {details.season !== undefined && ` · ${t("season", { number: details.season })}`}
        {` · ${t(details.availability)}`}
      </li>
      {details.services.length > 0 && (
        <li>{t("services", { services: details.services.join(", ") })}</li>
      )}
    </ul>
  );
}

/** What an event of a source calendar shows: title, date, details, link and the provider's credit. */
export function ExternalEventDialog({
  event,
  calendar,
  onClose,
}: {
  event: ExternalEventDto | null;
  calendar: Calendar | undefined;
  onClose: () => void;
}) {
  const t = useTranslations("Calendar.external");
  const locale = useLocale();
  const details =
    event?.kind === STREAMING_RELEASES_KIND
      ? streamingReleaseDetailsSchema.safeParse(event.details)
      : null;
  // An all-day event is stored at midnight UTC: the date part is the day, whatever the time zone.
  const day = event
    ? new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" }).format(
        new Date(event.start),
      )
    : "";
  // Only web links open: anything else a provider sends is not offered.
  const link = event?.url && /^https?:\/\//i.test(event.url) ? event.url : null;
  return (
    <Dialog open={Boolean(event)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {event && (
          <>
            <DialogHeader>
              <DialogTitle className="break-words">{event.title}</DialogTitle>
              <DialogDescription>{day}</DialogDescription>
            </DialogHeader>
            {calendar && (
              <p className="flex items-center gap-2 text-sm">
                <span
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: calendar.color }}
                  aria-hidden
                />
                {t("inCalendar", { calendar: calendar.name })}
              </p>
            )}
            {details?.success && <StreamingDetails details={details.data} />}
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1 text-sm underline underline-offset-2"
              >
                {t("openLink")}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            )}
            <p className="text-xs text-muted-foreground">{t("readOnly")}</p>
            {calendar?.source && (
              <a
                href={calendar.source.attribution.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-fit items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {t("attribution", { name: calendar.source.attribution.name })}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
