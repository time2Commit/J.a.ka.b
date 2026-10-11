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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Folder } from "@/lib/types";
import { buildTree, flattenFolders } from "./tree";

export interface NewItemValues {
  name: string;
  folderId: string | null;
  templateId: string | null;
}

/** Asks for the name and the folder of a new project or template (and the template to start from). */
export function NewItemDialog({
  open,
  title,
  namespace,
  folders,
  initialFolderId,
  templates,
  pending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  namespace: "Projects.tree" | "Templates.tree";
  folders: Folder[];
  initialFolderId: string | null;
  /** When given, a "Start from a template" choice is offered. */
  templates?: { id: string; name: string }[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (values: NewItemValues) => void;
}) {
  const t = useTranslations(namespace);
  const common = useTranslations("Common");
  const [name, setName] = useState("");
  const [folderId, setFolderId] = useState<string | null>(initialFolderId);
  const [templateId, setTemplateId] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName("");
      setFolderId(initialFolderId);
      setTemplateId(null);
    }
  }, [open, initialFolderId]);
  const flat = flattenFolders(buildTree(folders, [], "name").folders);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSubmit({ name: name.trim(), folderId, templateId });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{t("newItemHelp")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-item-name">{t("itemName")}</Label>
            <Input
              id="new-item-name"
              value={name}
              maxLength={120}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-item-folder">{t("folder")}</Label>
            <Select
              id="new-item-folder"
              value={folderId ?? ""}
              onChange={(e) => setFolderId(e.target.value || null)}
            >
              <option value="">{t("topLevel")}</option>
              {flat.map(({ folder, depth }) => (
                <option key={folder.id} value={folder.id}>
                  {`${"  ".repeat(depth)}${folder.name}`}
                </option>
              ))}
            </Select>
          </div>
          {templates && templates.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-item-template">{t("startFrom")}</Label>
              <Select
                id="new-item-template"
                value={templateId ?? ""}
                onChange={(e) => setTemplateId(e.target.value || null)}
              >
                <option value="">{t("noTemplate")}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {common("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {t("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
