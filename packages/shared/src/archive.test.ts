import { describe, expect, it } from "vitest";
import { archiveCardSchema } from "./archive";

describe("archiveCardSchema", () => {
  const base = {
    title: null,
    start: "2026-05-04T09:00:00.000Z",
    end: "2026-05-04T10:00:00.000Z",
    allDay: false,
    statusOverride: null,
    progressOverride: null,
    shortNotes: null,
    members: [],
    labels: [],
  };

  it("reads cards from older archives, whose empty lists meant 'the project's'", () => {
    expect(archiveCardSchema.parse(base).perCard).toBe(false);
  });

  it("keeps the flag that marks a card's own lists", () => {
    expect(archiveCardSchema.parse({ ...base, perCard: true }).perCard).toBe(true);
  });
});
