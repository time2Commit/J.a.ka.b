"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Download, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { Meta, Status } from "@/lib/types";
import { BackupFilesSection } from "./backup-files-section";
import { ImportSection } from "./import-section";
import { SectionCard } from "./section-card";
import { StatusDeleteDialog } from "./status-delete-dialog";

const PALETTE = [
  "#64748b",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
];

function useMetaMutation<T>(fn: (input: T) => Promise<unknown>, successMessage?: string) {
  const queryClient = useQueryClient();
  const common = useTranslations("Common");
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      if (successMessage) toast.success(successMessage);
      // Statuses, labels and people are shown on the cards: refresh those too.
      for (const key of ["meta", "cards", "projects"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError && error.status === 409 ? error.message : common("error"),
      ),
  });
}

function ColorInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <input
      type="color"
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      className="size-9 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-1"
    />
  );
}

/** The color and the name of an existing status or label: a change is saved as soon as it is made. */
function ColorNameFields({
  color,
  name,
  onColor,
  onName,
}: {
  color: string;
  name: string;
  onColor: (color: string) => void;
  onName: (name: string) => void;
}) {
  const common = useTranslations("Common");
  return (
    <>
      <ColorInput label={common("color")} value={color} onChange={onColor} />
      <Input
        key={name}
        aria-label={common("name")}
        defaultValue={name}
        className="max-w-56"
        onBlur={(e) => e.target.value.trim() && e.target.value !== name && onName(e.target.value)}
      />
    </>
  );
}

/** The form under a list of statuses or labels that adds a new one. */
function AddColorNameForm({
  initialColor,
  pending,
  onAdd,
}: {
  initialColor: string;
  pending: boolean;
  /** `done` clears the name field once the new item was saved. */
  onAdd: (input: { name: string; color: string }, done: () => void) => void;
}) {
  const common = useTranslations("Common");
  const [name, setName] = useState("");
  const [color, setColor] = useState(initialColor);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onAdd({ name, color }, () => setName(""));
      }}
    >
      <ColorInput label={common("color")} value={color} onChange={setColor} />
      <Input
        aria-label={common("name")}
        placeholder={common("name")}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-56"
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {common("add")}
      </Button>
    </form>
  );
}

function WorkspaceSection({ meta }: { meta: Meta }) {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const [form, setForm] = useState(meta.workspace);
  const save = useMetaMutation(
    (input: Partial<Meta["workspace"]>) => api("/api/workspace", { method: "PATCH", json: input }),
    common("saved"),
  );
  const zones = Intl.supportedValuesOf("timeZone");
  return (
    <SectionCard title={t("workspace")}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            name: form.name,
            timeZone: form.timeZone,
            workDayStart: form.workDayStart,
            workDayEnd: form.workDayEnd,
            firstDayOfWeek: form.firstDayOfWeek,
          });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="ws-name">{common("name")}</Label>
          <Input
            id="ws-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ws-tz">{t("timeZone")}</Label>
          <Select
            id="ws-tz"
            value={form.timeZone}
            onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ws-start">{t("workDayStart")}</Label>
          <Input
            id="ws-start"
            type="time"
            value={form.workDayStart}
            onChange={(e) => setForm({ ...form, workDayStart: e.target.value })}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ws-end">{t("workDayEnd")}</Label>
          <Input
            id="ws-end"
            type="time"
            value={form.workDayEnd}
            onChange={(e) => setForm({ ...form, workDayEnd: e.target.value })}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ws-first">{t("firstDay")}</Label>
          <Select
            id="ws-first"
            value={form.firstDayOfWeek}
            onChange={(e) => setForm({ ...form, firstDayOfWeek: Number(e.target.value) })}
          >
            <option value={1}>{t("monday")}</option>
            <option value={0}>{t("sunday")}</option>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={save.isPending}>
            {common("save")}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

function StatusesSection({ meta }: { meta: Meta }) {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const add = useMetaMutation((input: { name: string; color: string }) =>
    api("/api/statuses", { method: "POST", json: input }),
  );
  const update = useMetaMutation(
    ({ id, ...json }: { id: string; name?: string; color?: string; isDone?: boolean }) =>
      api(`/api/statuses/${id}`, { method: "PATCH", json }),
  );
  const [deleting, setDeleting] = useState<Status | null>(null);
  const remove = useMetaMutation(
    ({ id, replaceWith }: { id: string; replaceWith: string }) =>
      api(`/api/statuses/${id}`, { method: "DELETE", json: { replaceWith } }),
    t("statusDeleted"),
  );
  const reorder = useMetaMutation((ids: string[]) =>
    api("/api/statuses/reorder", { method: "POST", json: { ids } }),
  );

  const move = (index: number, delta: number) => {
    const ids = meta.statuses.map((s) => s.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    reorder.mutate(ids);
  };

  return (
    <SectionCard
      title={t("statuses")}
      help={t("statusesHelp")}
      contentClassName="flex flex-col gap-3"
    >
      <ul className="flex flex-col gap-2">
        {meta.statuses.map((s, i) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2">
            <ColorNameFields
              color={s.color}
              name={s.name}
              onColor={(color) => update.mutate({ id: s.id, color })}
              onName={(name) => update.mutate({ id: s.id, name })}
            />
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={s.isDone}
                onChange={(e) => update.mutate({ id: s.id, isDone: e.target.checked })}
              />
              {t("done")}
            </label>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("moveUp")}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("moveDown")}
              disabled={i === meta.statuses.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={common("delete")}
              onClick={() => setDeleting(s)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <AddColorNameForm
        initialColor={PALETTE[1]!}
        pending={add.isPending}
        onAdd={(input, done) => add.mutate(input, { onSuccess: done })}
      />
      <StatusDeleteDialog
        status={deleting}
        statuses={meta.statuses}
        pending={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={(replaceWith) =>
          remove.mutate({ id: deleting!.id, replaceWith }, { onSuccess: () => setDeleting(null) })
        }
      />
    </SectionCard>
  );
}

function LabelsSection({ meta }: { meta: Meta }) {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const add = useMetaMutation((input: { name: string; color: string }) =>
    api("/api/labels", { method: "POST", json: input }),
  );
  const update = useMetaMutation(({ id, ...json }: { id: string; name?: string; color?: string }) =>
    api(`/api/labels/${id}`, { method: "PATCH", json }),
  );
  const remove = useMetaMutation((id: string) => api(`/api/labels/${id}`, { method: "DELETE" }));
  return (
    <SectionCard title={t("labels")} contentClassName="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {meta.labels.map((l) => (
          <li key={l.id} className="flex items-center gap-2">
            <ColorNameFields
              color={l.color}
              name={l.name}
              onColor={(color) => update.mutate({ id: l.id, color })}
              onName={(name) => update.mutate({ id: l.id, name })}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={common("delete")}
              onClick={() => remove.mutate(l.id)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <AddColorNameForm
        initialColor={PALETTE[3]!}
        pending={add.isPending}
        onAdd={(input, done) => add.mutate(input, { onSuccess: done })}
      />
    </SectionCard>
  );
}

function UsersSection({ meta }: { meta: Meta }) {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const empty = { name: "", email: "", password: "", role: "member" };
  const [form, setForm] = useState(empty);
  const add = useMetaMutation(
    (input: typeof empty) => api("/api/users", { method: "POST", json: input }),
    t("userCreated"),
  );
  return (
    <SectionCard title={t("users")} help={t("usersHelp")} contentClassName="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {meta.users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 text-sm">
            <span
              className="flex size-8 items-center justify-center rounded-full font-semibold text-white"
              style={{ backgroundColor: u.avatarColor }}
            >
              {u.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="font-medium">{u.name}</span>
            <span className="text-muted-foreground">{u.email}</span>
            <span className="ml-auto text-xs text-muted-foreground">{t(u.role)}</span>
          </li>
        ))}
      </ul>
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
          <Label htmlFor="u-email">Email</Label>
          <Input
            id="u-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="u-password">Password</Label>
          <Input
            id="u-password"
            type="password"
            minLength={8}
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

function BackupSection() {
  const t = useTranslations("Settings.backup");
  const [versions, setVersions] = useState(false);
  const [archived, setArchived] = useState(false);
  const href = `/api/export?${new URLSearchParams({
    ...(versions && { versions: "1" }),
    ...(archived && { archived: "1" }),
  })}`;
  return (
    <SectionCard title={t("title")} help={t("help")} contentClassName="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
        {t("includeArchived")}
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={versions} onChange={(e) => setVersions(e.target.checked)} />
        {t("includeVersions")}
      </label>
      <Button asChild className="w-fit">
        <a href={href} download>
          <Download /> {t("download")}
        </a>
      </Button>
    </SectionCard>
  );
}

export function SettingsPage() {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<Meta>("/api/meta") });
  if (!meta.data) return <p className="text-muted-foreground">{common("loading")}</p>;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <WorkspaceSection meta={meta.data} />
      <StatusesSection meta={meta.data} />
      <LabelsSection meta={meta.data} />
      <UsersSection meta={meta.data} />
      <BackupFilesSection />
      <BackupSection />
      <ImportSection />
    </div>
  );
}
