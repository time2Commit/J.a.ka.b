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
}: {
  open: boolean;
  title: string;
  initial: string;
  confirmLabel: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const t = useTranslations("Projects.tree");
  const common = useTranslations("Common");
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSubmit(name.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{t("folderName")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="folder-name">{t("folderName")}</Label>
            <Input
              id="folder-name"
              value={name}
              maxLength={80}
              autoFocus
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {common("cancel")}
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
}) {
  const t = useTranslations("Projects.tree");
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
