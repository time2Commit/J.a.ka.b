"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { Meta } from "@/lib/types";
import { SectionCard } from "./section-card";
import { useMetaMutation } from "./use-meta-mutation";

export function UsersSection({ meta }: { meta: Meta }) {
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
