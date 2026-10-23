"use client";

import { Folder as FolderIcon, FolderInput } from "lucide-react";
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
import { DialogField, FormDialog } from "@/components/form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FolderNode } from "./tree";
import { flattenFolders } from "./tree";

/** Asks for a folder name: used to create a folder and to rename one. */
export function FolderNameDialog({
  open,
  title,
  initial,
  confirmLabel,
  pending,
  onClose,
  onSubmit,
  namespace,
}: {
  open: boolean;
  title: string;
  initial: string;
  confirmLabel: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  namespace: "Projects.tree" | "Templates.tree";
}) {
  const t = useTranslations(namespace);
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  return (
    <FormDialog
      open={open}
      title={title}
      description={t("folderName")}
      hideDescription
      submitLabel={confirmLabel}
      submitDisabled={pending || !name.trim()}
      onClose={onClose}
      onSubmit={() => name.trim() && onSubmit(name.trim())}
    >
      <DialogField>
        <Label htmlFor="folder-name">{t("folderName")}</Label>
        <Input
          id="folder-name"
          value={name}
          maxLength={80}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
      </DialogField>
    </FormDialog>
  );
}

/** "Move to…": pick the folder (or the top level) for a project or a folder. */
export function MoveDialog({
  title,
  folders,
  disabledIds,
  currentId,
  pending,
  onClose,
  onPick,
  namespace,
}: {
  /** Null keeps the dialog closed. */
  title: string | null;
  folders: FolderNode[];
  /** Folders that cannot be chosen (a folder and what is inside it). */
  disabledIds: Set<string>;
  currentId: string | null;
  pending: boolean;
  onClose: () => void;
  onPick: (folderId: string | null) => void;
  /** Where the texts come from: "Projects.tree" or "Templates.tree". */
  namespace: "Projects.tree" | "Templates.tree";
}) {
  const t = useTranslations(namespace);
  const common = useTranslations("Common");
  const [chosen, setChosen] = useState<string | null>(currentId);
  useEffect(() => {
    if (title !== null) setChosen(currentId);
  }, [title, currentId]);
  const flat = flattenFolders(folders);

  const option = (id: string | null, label: string, depth: number, disabled: boolean) => (
    <li key={id ?? "top"}>
      <button
        type="button"
        role="radio"
        aria-checked={chosen === id}
        disabled={disabled}
        onClick={() => setChosen(id)}
        style={{ paddingLeft: `${0.5 + depth * 1.1}rem` }}
        className={cn(
          "flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40",
          chosen === id ? "bg-accent font-medium" : "hover:bg-accent/50",
        )}
      >
        {id === null ? (
          <FolderInput className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <FolderIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
    </li>
  );

  return (
    <Dialog open={title !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? ""}</DialogTitle>
          <DialogDescription>{t("moveHelp")}</DialogDescription>
        </DialogHeader>
        <ul role="radiogroup" aria-label={t("moveTo")} className="max-h-72 overflow-y-auto">
          {option(null, t("topLevel"), 0, false)}
          {flat.map(({ folder, depth }) =>
            option(folder.id, folder.name, depth + 1, disabledIds.has(folder.id)),
          )}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {common("cancel")}
          </Button>
          <Button disabled={pending || chosen === currentId} onClick={() => onPick(chosen)}>
            {t("move")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
