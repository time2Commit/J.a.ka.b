import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordChangeSchema } from "@jakab/shared";

export type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";

/** Keys of the messages under `Account.errors`. */
export type PasswordErrorKey =
  | "currentRequired"
  | "wrongCurrent"
  | "tooShort"
  | "tooLong"
  | "mismatch"
  | "sameAsCurrent"
  | "tooManyAttempts"
  | "notChanged";

export type PasswordErrors = Partial<Record<PasswordField | "form", PasswordErrorKey>>;

type PasswordValues = Record<PasswordField, string>;

/** What is wrong with the form before anything is sent: at most one message per field. */
export function validatePasswordForm(values: PasswordValues): PasswordErrors {
  const result = passwordChangeSchema.safeParse(values);
  if (result.success) return {};
  const errors: PasswordErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as PasswordField;
    if (errors[field]) continue;
    if (field === "currentPassword") {
      errors.currentPassword = values.currentPassword === "" ? "currentRequired" : "tooLong";
    } else if (field === "confirmPassword") {
      errors.confirmPassword = "mismatch";
    } else if (values.newPassword.length < PASSWORD_MIN_LENGTH) {
      errors.newPassword = "tooShort";
    } else if (values.newPassword.length > PASSWORD_MAX_LENGTH) {
      errors.newPassword = "tooLong";
    } else {
      errors.newPassword = "sameAsCurrent";
    }
  }
  // A long current password cannot be the right one: say so in words that make sense for it.
  if (errors.currentPassword === "tooLong") errors.currentPassword = "wrongCurrent";
  return errors;
}

/** Turns the auth server's refusal into the field it is about and a message a person can act on. */
export function passwordErrorFromServer(error: { status?: number; code?: string }): PasswordErrors {
  if (error.status === 429) return { form: "tooManyAttempts" };
  switch (error.code) {
    case "INVALID_PASSWORD":
      return { currentPassword: "wrongCurrent" };
    case "PASSWORD_TOO_SHORT":
      return { newPassword: "tooShort" };
    case "PASSWORD_TOO_LONG":
      return { newPassword: "tooLong" };
    default:
      return { form: "notChanged" };
  }
}
