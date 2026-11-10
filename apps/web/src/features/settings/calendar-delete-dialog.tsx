"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Calendar } from "@/lib/types";

/** Asks where the cards of a calendar go before it is deleted (the default calendar by default). */
export function CalendarDeleteDialog({
  calendar,
  calendars,
  pending,
  onCancel,
  onConfirm,
}: {
  calendar: Calendar | null;
  calendars: Calendar[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (replaceWith: string) => void;
}) {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const others = calendars.filter((c) => c.id !== calendar?.id);
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (!calendar) return;
    setTarget((calendars.find((c) => c.isDefault && c.id !== calendar.id) ?? others[0])?.id ?? "");
    // `others` is derived from the two values listed here
  }, [calendar, calendars]);

  return (
    <Dialog open={Boolean(calendar)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteCalendarTitle", { name: calendar?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("deleteCalendarHelp")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="calendar-fallback">{t("moveTo")}</Label>
          <Select id="calendar-fallback" value={target} onChange={(e) => setTarget(e.target.value)}>
            {others.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {common("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={pending || !target}
            onClick={() => onConfirm(target)}
          >
            {t("deleteCalendarConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
