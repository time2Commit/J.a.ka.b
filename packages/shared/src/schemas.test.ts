import { describe, expect, it } from "vitest";
import {
  cardCreateSchema,
  cardUpdateSchema,
  projectUpdateSchema,
  statusInputSchema,
  templateInputSchema,
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
