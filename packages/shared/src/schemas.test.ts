import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";
import * as shared from "./index";
import {
  accountUpdateSchema,
  cardCreateSchema,
  cardUpdateSchema,
  passwordChangeSchema,
  projectUpdateSchema,
  statusInputSchema,
  statusUpdateSchema,
  templateInputSchema,
  templateUpdateSchema,
  versionCreateSchema,
} from "./schemas";

const base = { start: "2026-10-05T09:00:00Z", end: "2026-10-05T12:00:00Z" };

describe("cardCreateSchema", () => {
  it("accepts a new project name", () => {
    expect(cardCreateSchema.safeParse({ ...base, projectName: "Client X" }).success).toBe(true);
  });
  it("accepts an existing project id", () => {
    expect(cardCreateSchema.safeParse({ ...base, projectId: "p1" }).success).toBe(true);
  });
  it("requires exactly one of projectId and projectName", () => {
    expect(cardCreateSchema.safeParse(base).success).toBe(false);
    expect(cardCreateSchema.safeParse({ ...base, projectId: "p1", projectName: "X" }).success).toBe(
      false,
    );
  });
  it("rejects an end before the start", () => {
    const result = cardCreateSchema.safeParse({
      projectName: "X",
      start: base.end,
      end: base.start,
    });
    expect(result.success).toBe(false);
  });
});

describe("cardUpdateSchema", () => {
  it("allows partial updates and validates the range when both dates are given", () => {
    expect(cardUpdateSchema.safeParse({ title: "New" }).success).toBe(true);
    expect(cardUpdateSchema.safeParse({ start: base.end, end: base.start }).success).toBe(false);
  });
  it("accepts null overrides to clear them", () => {
    expect(
      cardUpdateSchema.safeParse({ statusOverrideId: null, progressOverride: null }).success,
    ).toBe(true);
  });
});

describe("projectUpdateSchema / statusInputSchema", () => {
  it("bounds progress to 0-100", () => {
    expect(projectUpdateSchema.safeParse({ progress: 100 }).success).toBe(true);
    expect(projectUpdateSchema.safeParse({ progress: 101 }).success).toBe(false);
    expect(projectUpdateSchema.safeParse({ progress: 1.5 }).success).toBe(false);
  });
  it("validates colors", () => {
    expect(statusInputSchema.safeParse({ name: "A", color: "red" }).success).toBe(false);
    expect(statusInputSchema.safeParse({ name: "A", color: "#ff0000" }).success).toBe(true);
  });
});

describe("versionCreateSchema", () => {
  it("accepts no label or a trimmed one, rejects blank or very long labels", () => {
    expect(versionCreateSchema.parse({})).toEqual({});
    expect(versionCreateSchema.parse({ label: "  Draft 1 " })).toEqual({ label: "Draft 1" });
    expect(versionCreateSchema.safeParse({ label: "   " }).success).toBe(false);
    expect(versionCreateSchema.safeParse({ label: "x".repeat(121) }).success).toBe(false);
  });
});

describe("cardCreateSchema templates and clones", () => {
  const base = { start: "2026-05-04T08:00:00Z", end: "2026-05-04T09:00:00Z" };
  it("accepts a template or a clone source for a new project, never both or with an existing project", () => {
    expect(cardCreateSchema.safeParse({ ...base, projectName: "A", templateId: "t" }).success).toBe(
      true,
    );
    const clone = cardCreateSchema.parse({ ...base, projectName: "A", cloneFromProjectId: "p" });
    expect(clone.cloneNote).toBeUndefined();
    expect(
      cardCreateSchema.safeParse({
        ...base,
        projectName: "A",
        templateId: "t",
        cloneFromProjectId: "p",
      }).success,
    ).toBe(false);
    expect(cardCreateSchema.safeParse({ ...base, projectId: "p", templateId: "t" }).success).toBe(
      false,
    );
  });
});

describe("templateInputSchema", () => {
  it("fills the defaults and bounds duration and checklist", () => {
    const t = templateInputSchema.parse({ name: " Kick-off " });
    expect(t).toMatchObject({
      name: "Kick-off",
      note: null,
      defaults: { statusId: null, labelIds: [], durationMin: 60, checklist: [] },
    });
    expect(templateInputSchema.safeParse({ name: "x", defaults: { durationMin: 1 } }).success).toBe(
      false,
    );
    expect(
      templateInputSchema.safeParse({ name: "x", defaults: { checklist: Array(51).fill("a") } })
        .success,
    ).toBe(false);
    expect(templateInputSchema.safeParse({ name: "x", note: { type: "paragraph" } }).success).toBe(
      false,
    );
  });
});

describe("accountUpdateSchema", () => {
  it("trims the name and rejects a blank or very long one", () => {
    expect(accountUpdateSchema.parse({ name: "  Anna Neri " })).toEqual({ name: "Anna Neri" });
    expect(accountUpdateSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(accountUpdateSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });
  it("drops fields a person may not change about themselves", () => {
    expect(
      accountUpdateSchema.parse({ name: "Anna", role: "admin", email: "x@example.com" }),
    ).toEqual({ name: "Anna" });
  });
});

describe("passwordChangeSchema", () => {
  const valid = {
    currentPassword: "password123",
    newPassword: "password456",
    confirmPassword: "password456",
  };
  const fieldsOf = (input: unknown) => {
    const result = passwordChangeSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
  };

  it("accepts a new password of 8 to 128 characters, confirmed", () => {
    expect(passwordChangeSchema.safeParse(valid).success).toBe(true);
    const longest = "x".repeat(128);
    expect(fieldsOf({ ...valid, newPassword: longest, confirmPassword: longest })).toEqual([]);
  });
  it("requires the current password", () => {
    expect(fieldsOf({ ...valid, currentPassword: "" })).toEqual(["currentPassword"]);
  });
  it("rejects a new password that is too short or too long", () => {
    expect(fieldsOf({ ...valid, newPassword: "short12", confirmPassword: "short12" })).toEqual([
      "newPassword",
    ]);
    const tooLong = "x".repeat(129);
    expect(fieldsOf({ ...valid, newPassword: tooLong, confirmPassword: tooLong })).toEqual([
      "newPassword",
    ]);
  });
  it("rejects a confirmation that differs", () => {
    expect(fieldsOf({ ...valid, confirmPassword: "password457" })).toEqual(["confirmPassword"]);
  });
  it("rejects a new password equal to the current one", () => {
    expect(
      fieldsOf({
        ...valid,
        newPassword: valid.currentPassword,
        confirmPassword: valid.currentPassword,
      }),
    ).toEqual(["newPassword"]);
  });
  it("does not trim passwords", () => {
    const spaced = " password456 ";
    expect(
      passwordChangeSchema.parse({ ...valid, newPassword: spaced, confirmPassword: spaced }),
    ).toMatchObject({ newPassword: spaced });
  });
});

describe("update schemas", () => {
  // `.partial()` keeps `.default()`: an update schema built from an input schema with defaults
  // would overwrite every stored field the caller did not send.
  const updateSchemas = Object.entries(shared).filter(
    ([name]) => name.endsWith("UpdateSchema") || name === "userPreferencesSchema",
  ) as [string, ZodType][];

  it("covers every update schema of the package", () => {
    expect(updateSchemas.map(([name]) => name)).toEqual(
      expect.arrayContaining([
        "statusUpdateSchema",
        "calendarUpdateSchema",
        "labelUpdateSchema",
        "cardUpdateSchema",
        "projectUpdateSchema",
        "folderUpdateSchema",
        "templateUpdateSchema",
        "workspaceUpdateSchema",
        "sourceUpdateSchema",
        "accountUpdateSchema",
      ]),
    );
  });

  it.each(updateSchemas)("%s adds nothing to an empty update", (_name, schema) => {
    expect(schema.parse({})).toEqual({});
  });

  it("a template update holds only the fields that were sent", () => {
    expect(templateUpdateSchema.parse({ folderId: "f1" })).toEqual({ folderId: "f1" });
    expect(templateUpdateSchema.parse({ name: " New name " })).toEqual({ name: "New name" });
    expect(templateUpdateSchema.parse({ note: null })).toEqual({ note: null });
    // The defaults are replaced as a whole, so the settings left out of them are filled in.
    expect(templateUpdateSchema.parse({ defaults: { durationMin: 30 } })).toEqual({
      defaults: { statusId: null, labelIds: [], memberIds: [], durationMin: 30, checklist: [] },
    });
  });

  it("a status update holds only the fields that were sent", () => {
    expect(statusUpdateSchema.parse({ name: "Shipped" })).toEqual({ name: "Shipped" });
    expect(statusUpdateSchema.parse({ color: "#00ff00" })).toEqual({ color: "#00ff00" });
    expect(statusUpdateSchema.parse({ isDone: false })).toEqual({ isDone: false });
    // Creating still defaults to "not done".
    expect(statusInputSchema.parse({ name: "Open", color: "#00ff00" }).isDone).toBe(false);
  });
});
