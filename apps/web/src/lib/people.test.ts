import { describe, expect, it } from "vitest";
import { assignablePeople } from "./people";

const anna = { id: "a", deactivatedAt: null };
const luca = { id: "l", deactivatedAt: "2026-11-16T10:00:00.000Z" };
const sara = { id: "s", deactivatedAt: "2026-11-16T10:00:00.000Z" };

describe("assignablePeople", () => {
  it("offers only active accounts", () => {
    expect(assignablePeople([anna, luca, sara])).toEqual([anna]);
  });
  it("keeps a deactivated account that is already chosen, so it can be removed", () => {
    expect(assignablePeople([anna, luca, sara], ["l"])).toEqual([anna, luca]);
  });
});
