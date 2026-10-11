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
import type { Status } from "@/lib/types";

/** Asks where the projects and cards that use a status go before it is deleted. */
export function StatusDeleteDialog({
  status,
  statuses,
  pending,
  onCancel,
  onConfirm,
}: {
  status: Status | null;
  statuses: Status[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (replaceWith: string) => void;
}) {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const others = statuses.filter((s) => s.id !== status?.id);
  const [target, setTarget] = useState("");

  // Default to the nearest status: the previous one, else the next.
  useEffect(() => {
    if (!status) return;
    const index = statuses.findIndex((s) => s.id === status.id);
    setTarget((statuses[index - 1] ?? statuses[index + 1])?.id ?? "");
  }, [status, statuses]);

  return (
    <Dialog open={Boolean(status)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("deleteStatusTitle", { name: status?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("deleteStatusHelp")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status-fallback">{t("moveTo")}</Label>
          <Select id="status-fallback" value={target} onChange={(e) => setTarget(e.target.value)}>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
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
            {t("deleteStatusConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
