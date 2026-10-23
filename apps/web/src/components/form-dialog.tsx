"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * A dialog made of a title, a form (the fields are the children) and Cancel / submit buttons.
 * Closing, by the button, Escape or a click outside, calls `onClose`.
 */
export function FormDialog({
  open,
  title,
  description,
  hideDescription = false,
  submitLabel,
  submitDisabled = false,
  onClose,
  onSubmit,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  /** Keep the description for screen readers only. */
  hideDescription?: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: ReactNode;
}) {
  const common = useTranslations("Common");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={hideDescription ? "sr-only" : undefined}>
              {description}
            </DialogDescription>
          </DialogHeader>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {common("cancel")}
            </Button>
            <Button type="submit" disabled={submitDisabled}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A label above a field, with the spacing the dialogs use. */
export function DialogField({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2">{children}</div>;
}
