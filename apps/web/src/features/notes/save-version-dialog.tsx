"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { DialogField, FormDialog } from "@/components/form-dialog";
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
    <FormDialog
      open={open}
      title={t("saveTitle")}
      description={t("saveDescription")}
      submitLabel={t("save")}
      submitDisabled={save.isPending}
      onClose={() => onOpenChange(false)}
      onSubmit={() => save.mutate()}
    >
      <DialogField>
        <Label htmlFor="version-label">{t("label")}</Label>
        <Input
          id="version-label"
          value={label}
          maxLength={120}
          placeholder={t("labelPlaceholder")}
          onChange={(e) => setLabel(e.target.value)}
          autoFocus
        />
      </DialogField>
    </FormDialog>
  );
}
