"use client";

import { accountUpdateSchema } from "@jakab/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/features/settings/section-card";
import { api } from "@/lib/api";
import { PasswordForm } from "./password-form";

function ProfileSection({ name, email }: { name: string; email: string }) {
  const t = useTranslations("Account");
  const router = useRouter();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(name);
  const [invalid, setInvalid] = useState(false);
  const save = useMutation({
    mutationFn: (input: { name: string }) =>
      api<{ name: string }>("/api/me", { method: "PATCH", json: input }),
    onSuccess: (user) => {
      setValue(user.name);
      toast.success(t("nameSaved"));
      // The name is in the header (rendered on the server) and in the cached list of people.
      router.refresh();
      for (const key of ["meta", "cards", "projects"]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: () => toast.error(t("nameError")),
  });

  return (
    <SectionCard title={t("profile")} help={t("profileHelp")}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const parsed = accountUpdateSchema.safeParse({ name: value });
          setInvalid(!parsed.success);
          if (parsed.success) save.mutate({ name: parsed.data.name ?? "" });
        }}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="account-name">{t("name")}</Label>
          <Input
            id="account-name"
            autoComplete="name"
            maxLength={80}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setInvalid(false);
            }}
            aria-invalid={invalid}
            aria-describedby={invalid ? "account-name-error" : undefined}
          />
          {invalid && (
            <p id="account-name-error" role="alert" className="text-sm text-destructive">
              {t("nameInvalid")}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="account-email">{t("email")}</Label>
          <Input
            id="account-email"
            type="email"
            value={email}
            readOnly
            aria-describedby="account-email-help"
            className="text-muted-foreground"
          />
          <p id="account-email-help" className="text-xs text-muted-foreground">
            {t("emailHelp")}
          </p>
        </div>
        <div>
          <Button type="submit" disabled={save.isPending || value.trim() === name}>
            {t("saveName")}
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

export function AccountPage({
  name,
  email,
  temporaryPassword = false,
}: {
  name: string;
  email: string;
  /** An administrator reset the password: nothing else is reachable until a new one is chosen. */
  temporaryPassword?: boolean;
}) {
  const t = useTranslations("Account");
  if (temporaryPassword) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("temporaryTitle")}</h1>
        <SectionCard title={t("password")} help={t("temporaryHelp")}>
          {/* A full load: every page was redirecting here, none of that may stay cached. */}
          <PasswordForm email={email} onChanged={() => window.location.assign("/")} />
        </SectionCard>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <ProfileSection name={name} email={email} />
      <SectionCard title={t("password")} help={t("passwordHelp")}>
        <PasswordForm email={email} />
      </SectionCard>
    </div>
  );
}
