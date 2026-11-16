"use client";

import { PASSWORD_MAX_LENGTH } from "@jakab/shared";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import {
  passwordErrorFromServer,
  validatePasswordForm,
  type PasswordErrors,
  type PasswordField,
} from "./password-errors";

const EMPTY = { currentPassword: "", newPassword: "", confirmPassword: "" };

const FIELDS: { field: PasswordField; autoComplete: string }[] = [
  { field: "currentPassword", autoComplete: "current-password" },
  { field: "newPassword", autoComplete: "new-password" },
  { field: "confirmPassword", autoComplete: "new-password" },
];

/** Changes the signed-in person's password and signs them out of every other device. */
export function PasswordForm({ email, onChanged }: { email: string; onChanged?: () => void }) {
  const t = useTranslations("Account");
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validatePasswordForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    let result: PasswordErrors;
    try {
      const { error } = await authClient.changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        revokeOtherSessions: true,
      });
      result = error ? passwordErrorFromServer(error) : {};
    } catch {
      result = { form: "notChanged" };
    }
    setPending(false);
    setErrors(result);
    if (Object.keys(result).length > 0) return;
    setValues(EMPTY);
    toast.success(t("passwordChanged"));
    onChanged?.();
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {/* Lets a password manager file the new password under the right account. */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      {FIELDS.map(({ field, autoComplete }) => {
        const error = errors[field];
        const hint = field === "newPassword" ? "password-hint" : undefined;
        return (
          <div key={field} className="flex flex-col gap-2">
            <Label htmlFor={`account-${field}`}>{t(field)}</Label>
            <Input
              id={`account-${field}`}
              name={field}
              type="password"
              autoComplete={autoComplete}
              maxLength={PASSWORD_MAX_LENGTH + 1}
              value={values[field]}
              onChange={(event) => {
                setValues({ ...values, [field]: event.target.value });
                setErrors({ ...errors, [field]: undefined, form: undefined });
              }}
              aria-invalid={error !== undefined}
              aria-describedby={error ? `account-${field}-error` : hint}
            />
            {error ? (
              <p id={`account-${field}-error`} role="alert" className="text-sm text-destructive">
                {t(`errors.${error}`)}
              </p>
            ) : (
              hint && (
                <p id={hint} className="text-xs text-muted-foreground">
                  {t("passwordHint")}
                </p>
              )
            )}
          </div>
        );
      })}
      {errors.form && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${errors.form}`)}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {t("changePassword")}
        </Button>
      </div>
    </form>
  );
}
