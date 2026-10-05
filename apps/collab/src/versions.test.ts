import { describe, expect, it } from "vitest";
import { selectVersionsToPrune, type VersionSummary } from "./versions";

const at = (iso: string, reason: VersionSummary["reason"], id: string): VersionSummary => ({
  id,
  reason,
  createdAt: new Date(iso),
});

describe("selectVersionsToPrune", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("keeps everything recent, thins older automatic versions to one per day", () => {
    const versions = [
      at("2026-10-19T09:00:00Z", "auto", "recent-1"),
      at("2026-10-19T10:00:00Z", "auto", "recent-2"),
      at("2026-10-10T08:00:00Z", "auto", "old-a1"),
      at("2026-10-10T16:00:00Z", "auto", "old-a2"),
      at("2026-10-10T20:00:00Z", "auto", "old-a3"),
      at("2026-10-09T10:00:00Z", "auto", "old-b1"),
    ];
    expect(selectVersionsToPrune(versions, now).sort()).toEqual(["old-a1", "old-a2"]);
  });

  it("never selects manual or pre-restore versions", () => {
    const versions = [
      at("2026-10-01T08:00:00Z", "manual", "m"),
      at("2026-10-01T09:00:00Z", "pre_restore", "p"),
      at("2026-10-01T10:00:00Z", "auto", "a"),
    ];
    expect(selectVersionsToPrune(versions, now)).toEqual([]);
  });
});
