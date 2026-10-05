"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { versionsKey } from "./version-history";

/** Saves the current note as a manual version, optionally with a label ("Sent to the client"). */
export function SaveVersionDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Note.history");
  const common = useTranslations("Common");
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("");

  const save = useMutation({
    mutationFn: () =>
      api(`/api/projects/${projectId}/versions`, {
        method: "POST",
        json: label.trim() ? { label: label.trim() } : {},
      }),
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: versionsKey(projectId) });
      setLabel("");
      onOpenChange(false);
    },
    onError: () => toast.error(common("error")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("saveTitle")}</DialogTitle>
          <DialogDescription>{t("saveDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="version-label">{t("label")}</Label>
            <Input
              id="version-label"
              value={label}
              maxLength={120}
              placeholder={t("labelPlaceholder")}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {common("cancel")}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
