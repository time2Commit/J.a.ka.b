import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { generateTemporaryPassword, userActionError, userActionRequest } from "./user-actions";

describe("userActionError", () => {
  it("recognises the refusals the server names", () => {
    expect(userActionError(new ApiError(409, "x", "self"))).toBe("self");
    expect(userActionError(new ApiError(429, "x"))).toBe("tooMany");
  });
  it("falls back to a plain failure", () => {
    expect(userActionError(new ApiError(500, "x"))).toBe("failed");
    expect(userActionError(new Error("offline"))).toBe("failed");
  });
});

describe("userActionRequest", () => {
  it("sends each action to the right route with only its own field", () => {
    expect(userActionRequest("resetPassword", "u1", "temporary1")).toEqual({
      path: "/api/users/u1/reset-password",
      method: "POST",
      json: { password: "temporary1" },
    });
    expect(userActionRequest("makeAdmin", "u1", "")).toMatchObject({ json: { role: "admin" } });
    expect(userActionRequest("makeMember", "u1", "")).toMatchObject({ json: { role: "member" } });
    expect(userActionRequest("deactivate", "u1", "")).toEqual({
      path: "/api/users/u1",
      method: "PATCH",
      json: { active: false },
    });
    expect(userActionRequest("reactivate", "u1", "")).toMatchObject({ json: { active: true } });
  });
  it("escapes the id in the path", () => {
    expect(userActionRequest("deactivate", "a/b", "").path).toBe("/api/users/a%2Fb");
  });
});

describe("generateTemporaryPassword", () => {
  it("makes passwords of the asked length from letters and digits that cannot be confused", () => {
    const password = generateTemporaryPassword();
    expect(password).toMatch(/^[a-km-np-zA-HJ-NP-Z2-9]{14}$/);
    expect(generateTemporaryPassword()).not.toBe(password);
  });
  it("never goes below the minimum length", () => {
    expect(generateTemporaryPassword(3)).toHaveLength(8);
  });
  it("skips values that would bias the choice", () => {
    let call = 0;
    const password = generateTemporaryPassword(8, (values) => {
      // First round: only out-of-range values. Second round: zeros.
      values.fill(call++ === 0 ? 0xffff_ffff : 0);
      return values;
    });
    expect(password).toBe("aaaaaaaa");
  });
});
