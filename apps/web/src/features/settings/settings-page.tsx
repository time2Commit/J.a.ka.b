"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api, ApiError } from "@/lib/api";
import type { Meta } from "@/lib/types";

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
      void queryClient.invalidateQueries({ queryKey: ["meta"] });
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("workspace")}</CardTitle>
      </CardHeader>
      <CardContent>
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
      </CardContent>
    </Card>
  );
}

function StatusesSection({ meta }: { meta: Meta }) {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[1]!);
  const add = useMetaMutation((input: { name: string; color: string }) =>
    api("/api/statuses", { method: "POST", json: input }),
  );
  const update = useMetaMutation(
    ({ id, ...json }: { id: string; name?: string; color?: string; isDone?: boolean }) =>
      api(`/api/statuses/${id}`, { method: "PATCH", json }),
  );
  const remove = useMetaMutation((id: string) => api(`/api/statuses/${id}`, { method: "DELETE" }));
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("statuses")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("statusesHelp")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {meta.statuses.map((s, i) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <ColorInput
                label={common("color")}
                value={s.color}
                onChange={(v) => update.mutate({ id: s.id, color: v })}
              />
              <Input
                key={s.name}
                aria-label={common("name")}
                defaultValue={s.name}
                className="max-w-56"
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== s.name &&
                  update.mutate({ id: s.id, name: e.target.value })
                }
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
                onClick={() => remove.mutate(s.id)}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add.mutate({ name, color }, { onSuccess: () => setName("") });
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
          <Button type="submit" variant="secondary" disabled={add.isPending}>
            {common("add")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function LabelsSection({ meta }: { meta: Meta }) {
  const t = useTranslations("Settings");
  const common = useTranslations("Common");
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[3]!);
  const add = useMetaMutation((input: { name: string; color: string }) =>
    api("/api/labels", { method: "POST", json: input }),
  );
  const update = useMetaMutation(({ id, ...json }: { id: string; name?: string; color?: string }) =>
    api(`/api/labels/${id}`, { method: "PATCH", json }),
  );
  const remove = useMetaMutation((id: string) => api(`/api/labels/${id}`, { method: "DELETE" }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("labels")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2">
          {meta.labels.map((l) => (
            <li key={l.id} className="flex items-center gap-2">
              <ColorInput
                label={common("color")}
                value={l.color}
                onChange={(v) => update.mutate({ id: l.id, color: v })}
              />
              <Input
                key={l.name}
                aria-label={common("name")}
                defaultValue={l.name}
                className="max-w-56"
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== l.name &&
                  update.mutate({ id: l.id, name: e.target.value })
                }
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
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) add.mutate({ name, color }, { onSuccess: () => setName("") });
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
          <Button type="submit" variant="secondary" disabled={add.isPending}>
            {common("add")}
          </Button>
        </form>
      </CardContent>
    </Card>
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("users")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("usersHelp")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
      </CardContent>
    </Card>
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
    </div>
  );
}
