import { describe, expect, it } from "vitest";
import { queryRootsFor } from "./board-event-queries";

const event = (entity: string) => JSON.stringify({ entity, id: "x" });

describe("queryRootsFor", () => {
  it("refreshes only what a change can affect", () => {
    expect(queryRootsFor(event("card"))).toEqual(["cards", "projects"]);
    expect(queryRootsFor(event("workspace"))).toEqual(["meta"]);
    expect(queryRootsFor(event("folder"))).toEqual(["projects", "templates"]);
  });

  it("refreshes the cards, the lists and the settings when a status or a label changes", () => {
    for (const entity of ["status", "label"]) {
      expect([...queryRootsFor(event(entity))].sort()).toEqual([
        "cards",
        "meta",
        "projects",
        "templates",
      ]);
    }
  });

  it("keeps the settings fresh after a project change (an import can add statuses)", () => {
    expect(queryRootsFor(event("project"))).toContain("meta");
    expect(queryRootsFor(event("project"))).toContain("cards");
  });

  it("refreshes everything when the event is not understood", () => {
    const all = ["cards", "meta", "projects", "templates"];
    expect([...queryRootsFor("not json")].sort()).toEqual(all);
    expect([...queryRootsFor("{}")].sort()).toEqual(all);
    expect([...queryRootsFor(event("something-new"))].sort()).toEqual(all);
  });
});
