"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileStack } from "lucide-react";
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
import { templatesKey } from "@/features/templates/template-dialog";
import { api, ApiError } from "@/lib/api";

/** "Save as template": the project's settings and note content (without files) become a template. */
export function SaveAsTemplate({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const t = useTranslations("Projects.template");
  const common = useTranslations("Common");
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(projectName);

  const save = useMutation({
    mutationFn: () =>
      api(`/api/projects/${projectId}/save-as-template`, { method: "POST", json: { name } }),
    onSuccess: () => {
      toast.success(t("saved"));
      void queryClient.invalidateQueries({ queryKey: templatesKey });
      setOpen(false);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 409 ? t("nameTaken") : common("error"),
      ),
  });

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileStack /> {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
            <DialogDescription>{t("description")}</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="save-template-name">{t("name")}</Label>
              <Input
                id="save-template-name"
                value={name}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {common("cancel")}
              </Button>
              <Button type="submit" disabled={save.isPending || name.trim() === ""}>
                {t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
