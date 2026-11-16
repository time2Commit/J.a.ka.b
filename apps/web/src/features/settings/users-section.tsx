"use client";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@jakab/shared";
import { useMutation } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { Member, Meta } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SectionCard } from "./section-card";
import { useMetaMutation, useRefreshSettingsData } from "./use-meta-mutation";
import {
  generateTemporaryPassword,
  userActionError,
  userActionRequest,
  type UserAction,
} from "./user-actions";

interface Pending {
  user: Member;
  action: UserAction;
}

/**
 * Confirms one action on one account. Resetting the password also asks for the temporary one,
 * shown in clear: the administrator has to pass it on.
 */
function UserActionDialog({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: Pending | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (password: string) => void;
}) {
  const t = useTranslations("Settings.userActions");
  const common = useTranslations("Common");
  const [password, setPassword] = useState("");
  const [shownFor, setShownFor] = useState<Pending | null>(null);
  // A new dialog never starts with the password typed for somebody else.
  if (pending !== shownFor) {
    setShownFor(pending);
    setPassword("");
  }
  const action = pending?.action;
  const reset = action === "resetPassword";
  const tooShort = password.length < PASSWORD_MIN_LENGTH;

  return (
    <Dialog open={Boolean(pending)} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            if (!(reset && tooShort)) onConfirm(password);
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {action ? t(`${action}.title`, { name: pending?.user.name ?? "" }) : ""}
            </DialogTitle>
            <DialogDescription>{action ? t(`${action}.help`) : ""}</DialogDescription>
          </DialogHeader>
          {reset && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="temporary-password">{t("temporaryPassword")}</Label>
              <div className="flex gap-2">
                <Input
                  id="temporary-password"
                  // In clear on purpose, and not a password field: it is not theirs to save.
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-describedby="temporary-password-hint"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPassword(generateTemporaryPassword())}
                >
                  {t("generate")}
                </Button>
              </div>
              <p id="temporary-password-hint" className="text-xs text-muted-foreground">
                {t("temporaryPasswordHint")}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
              {common("cancel")}
            </Button>
            <Button
              type="submit"
              variant={action === "deactivate" ? "destructive" : "default"}
              disabled={busy || (reset && tooShort)}
            >
              {action ? t(`${action}.confirm`) : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UserRow({
  user,
  isSelf,
  onAction,
}: {
  user: Member;
  isSelf: boolean;
  onAction: (action: UserAction) => void;
}) {
  const t = useTranslations("Settings");
  const actions = useTranslations("Settings.userActions");
  const deactivated = user.deactivatedAt !== null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full font-semibold text-white",
          deactivated && "opacity-50",
        )}
        style={{ backgroundColor: user.avatarColor }}
        aria-hidden
      >
        {user.name.slice(0, 1).toUpperCase()}
      </span>
      <span className={cn("font-medium", deactivated && "text-muted-foreground")}>
        {user.name}
        {isSelf && <span className="font-normal text-muted-foreground"> {actions("you")}</span>}
      </span>
      <span className="min-w-0 truncate text-muted-foreground">{user.email}</span>
      <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
        {deactivated && (
          <span className="rounded-full border px-2 py-0.5 font-medium">
            {actions("deactivated")}
          </span>
        )}
        {t(user.role)}
      </span>
      {isSelf ? (
        // Keeps the rows aligned; one's own account is changed from the account page.
        <span className="size-8" aria-hidden />
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={actions("menu", { name: user.name })}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onAction("resetPassword")}>
              {actions("resetPassword.item")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => onAction(user.role === "admin" ? "makeMember" : "makeAdmin")}
            >
              {actions(user.role === "admin" ? "makeMember.item" : "makeAdmin.item")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onAction(deactivated ? "reactivate" : "deactivate")}>
              {actions(deactivated ? "reactivate.item" : "deactivate.item")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

export function UsersSection({ meta }: { meta: Meta }) {
  const t = useTranslations("Settings");
  const actions = useTranslations("Settings.userActions");
  const common = useTranslations("Common");
  const auth = useTranslations("Auth");
  const empty = { name: "", email: "", password: "", role: "member" };
  const [form, setForm] = useState(empty);
  const [pending, setPending] = useState<Pending | null>(null);
  const add = useMetaMutation(
    (input: typeof empty) => api("/api/users", { method: "POST", json: input }),
    t("userCreated"),
  );
  const refresh = useRefreshSettingsData();
  const act = useMutation({
    mutationFn: ({ user, action, password }: Pending & { password: string }) => {
      const { path, ...init } = userActionRequest(action, user.id, password);
      return api<{ notesDisconnected?: boolean }>(path, init);
    },
    onSuccess: (result, { user, action }) => {
      toast.success(actions(`${action}.done`, { name: user.name }));
      // Their sessions are closed either way; only the notes they had open may linger.
      if (result.notesDisconnected === false) toast.warning(actions("notesStillOpen"));
      refresh();
    },
    onError: (error) => toast.error(actions(`errors.${userActionError(error)}`)),
  });
  return (
    <SectionCard title={t("users")} help={t("usersHelp")} contentClassName="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {meta.users.map((u) => (
          <UserRow
            key={u.id}
            user={u}
            isSelf={u.id === meta.currentUserId}
            onAction={(action) => setPending({ user: u, action })}
          />
        ))}
      </ul>
      <UserActionDialog
        pending={pending}
        busy={act.isPending}
        // Not while the request runs: its answer would close whichever dialog is open by then.
        onCancel={() => !act.isPending && setPending(null)}
        onConfirm={(password) => {
          if (!pending) return;
          act.mutate({ ...pending, password }, { onSuccess: () => setPending(null) });
        }}
      />
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(form, { onSuccess: () => setForm(empty) });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="u-name">{common("name")}</Label>
          <Input
            id="u-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="u-email">{auth("email")}</Label>
          <Input
            id="u-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="u-password">{auth("password")}</Label>
          <Input
            id="u-password"
            type="password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="u-role">{t("role")}</Label>
          <Select
            id="u-role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="member">{t("member")}</option>
            <option value="admin">{t("admin")}</option>
          </Select>
        </div>
        <div>
          <Button type="submit" disabled={add.isPending}>
            {t("newUser")}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}
