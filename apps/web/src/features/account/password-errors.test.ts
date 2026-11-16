import { describe, expect, it } from "vitest";
import { passwordErrorFromServer, validatePasswordForm } from "./password-errors";

const valid = {
  currentPassword: "password123",
  newPassword: "password456",
  confirmPassword: "password456",
};

describe("validatePasswordForm", () => {
  it("finds nothing wrong with a valid form", () => {
    expect(validatePasswordForm(valid)).toEqual({});
  });
  it("names each problem on its own field", () => {
    expect(
      validatePasswordForm({ currentPassword: "", newPassword: "short", confirmPassword: "x" }),
    ).toEqual({
      currentPassword: "currentRequired",
      newPassword: "tooShort",
      confirmPassword: "mismatch",
    });
  });
  it("tells a too long password from one equal to the current", () => {
    const long = "x".repeat(129);
    expect(validatePasswordForm({ ...valid, newPassword: long, confirmPassword: long })).toEqual({
      newPassword: "tooLong",
    });
    expect(
      validatePasswordForm({
        ...valid,
        newPassword: "password123",
        confirmPassword: "password123",
      }),
    ).toEqual({ newPassword: "sameAsCurrent" });
  });
  it("treats an impossibly long current password as a wrong one", () => {
    expect(validatePasswordForm({ ...valid, currentPassword: "x".repeat(129) })).toEqual({
      currentPassword: "wrongCurrent",
    });
  });
});

describe("passwordErrorFromServer", () => {
  it("maps the auth server's codes to a field and a message", () => {
    expect(passwordErrorFromServer({ status: 400, code: "INVALID_PASSWORD" })).toEqual({
      currentPassword: "wrongCurrent",
    });
    expect(passwordErrorFromServer({ status: 400, code: "PASSWORD_TOO_SHORT" })).toEqual({
      newPassword: "tooShort",
    });
    expect(passwordErrorFromServer({ status: 400, code: "PASSWORD_TOO_LONG" })).toEqual({
      newPassword: "tooLong",
    });
  });
  it("recognises the rate limit whatever the body says", () => {
    expect(passwordErrorFromServer({ status: 429 })).toEqual({ form: "tooManyAttempts" });
  });
  it("says the password was not changed for anything else", () => {
    expect(passwordErrorFromServer({ status: 500 })).toEqual({ form: "notChanged" });
    expect(passwordErrorFromServer({})).toEqual({ form: "notChanged" });
  });
});
