import { PASSWORD_MIN_LENGTH } from "@jakab/shared";
import { ApiError } from "@/lib/api";

/** What an administrator can do to somebody else's account from the users list. */
export type UserAction = "resetPassword" | "makeAdmin" | "makeMember" | "deactivate" | "reactivate";

/** Keys of the messages under `Settings.userActions.errors`. */
export type UserActionError = "self" | "tooMany" | "failed";

/** Why the server refused, in terms the page has words for. */
export function userActionError(error: unknown): UserActionError {
  if (error instanceof ApiError) {
    if (error.code === "self") return "self";
    if (error.status === 429) return "tooMany";
  }
  return "failed";
}

/** The request each action sends for the account `id`. */
export function userActionRequest(action: UserAction, id: string, password: string) {
  const user = `/api/users/${encodeURIComponent(id)}`;
  switch (action) {
    case "resetPassword":
      return { path: `${user}/reset-password`, method: "POST", json: { password } };
    case "makeAdmin":
      return { path: user, method: "PATCH", json: { role: "admin" } };
    case "makeMember":
      return { path: user, method: "PATCH", json: { role: "member" } };
    case "deactivate":
      return { path: user, method: "PATCH", json: { active: false } };
    case "reactivate":
      return { path: user, method: "PATCH", json: { active: true } };
  }
}

// No look-alike characters (0/O, 1/l/I): the password is read out or copied by hand.
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A random temporary password that is easy to dictate. */
export function generateTemporaryPassword(
  length = 14,
  random: (values: Uint32Array) => Uint32Array = (values) => crypto.getRandomValues(values),
) {
  const size = Math.max(length, PASSWORD_MIN_LENGTH);
  // Rejection sampling: a plain modulo would favour the first letters of the alphabet.
  const limit = Math.floor(0x1_0000_0000 / ALPHABET.length) * ALPHABET.length;
  let out = "";
  while (out.length < size) {
    for (const value of random(new Uint32Array(size))) {
      if (value < limit && out.length < size) out += ALPHABET[value % ALPHABET.length];
    }
  }
  return out;
}
