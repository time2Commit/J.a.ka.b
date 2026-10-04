"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    setPending(true);
    const { error } =
      mode === "login"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(data.get("name")) });
    setPending(false);
    if (error) {
      toast.error(mode === "login" ? t("invalidCredentials") : t("genericError"));
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {mode === "register" && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t("name")}</Label>
          <Input id="name" name="name" autoComplete="name" required />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
        {mode === "register" && (
          <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
        )}
      </div>
      <Button type="submit" disabled={pending}>
        {mode === "login" ? t("signIn") : t("signUp")}
      </Button>
    </form>
  );
}
