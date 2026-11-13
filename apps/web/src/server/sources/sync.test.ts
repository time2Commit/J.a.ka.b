import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPrismaClient } from "@jakab/db";
import { z } from "zod";
import { encryptSecret } from "./secret-box";
import { defineSource, SourceError, type SourceEventInput } from "./types";

/** A source whose behaviour each test sets: the registry hands out this one. */
const behaviour: {
  events: SourceEventInput[];
  remove: string[];
  fail: SourceError | Error | null;
  wait: Promise<void> | null;
  calls: number;
} = { events: [], remove: [], fail: null, wait: null, calls: 0 };

const fake = defineSource({
  kind: "fake",
  name: "Fake",
  attribution: { name: "Fake", url: "https://example.com/" },
  hosts: [],
  intervalHours: 24,
  credentialsSchema: z.object({ apiKey: z.string() }),
  configSchema: z.object({}),
  verifyConfigSchema: z.object({}),
  stateSchema: z.object({ n: z.number() }),
  initialState: () => ({ n: 0 }),
  detailsSchema: z.object({ note: z.string() }),
  verify: async () => ({}),
  sync: async ({ state }) => {
    behaviour.calls++;
    if (behaviour.wait) await behaviour.wait;
    if (behaviour.fail) throw behaviour.fail;
    return {
      events: behaviour.events,
      removeExternalIds: behaviour.remove,
      state: { n: state.n + 1 },
    };
  },
});

vi.mock("./registry", () => ({
  getSource: (kind: string) => (kind === "fake" ? fake : null),
  listSources: () => [fake],
}));

const { syncDueSources, syncSource } = await import("./sync");

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const NOW = new Date("2026-11-13T10:00:00Z");
const calendarIds: string[] = [];
const secret = "fake-key-0000-1111";

const event = (externalId: string, title = "Title", extra: Partial<SourceEventInput> = {}) => ({
  externalId,
  title,
  start: new Date("2026-11-14T00:00:00Z"),
  end: new Date("2026-11-15T00:00:00Z"),
  allDay: true,
  ...extra,
});

async function newSource(overrides: Record<string, unknown> = {}) {
  const calendar = await prisma.calendar.create({
    data: {
      name: `Fake ${run} ${calendarIds.length}`,
      color: "#123456",
      kind: "source",
      order: 99,
    },
  });
  calendarIds.push(calendar.id);
  return prisma.calendarSource.create({
    data: {
      kind: "fake",
      calendarId: calendar.id,
      config: {},
      secret: encryptSecret(JSON.stringify({ apiKey: secret })),
      secretHint: secret.slice(-4),
      state: { n: 0 },
      nextSyncAt: NOW,
      ...overrides,
    },
  });
}
const eventsOf = (calendarId: string) =>
  prisma.externalEvent.findMany({ where: { calendarId }, orderBy: { externalId: "asc" } });

function reset() {
  Object.assign(behaviour, { events: [], remove: [], fail: null, wait: null, calls: 0 });
}

beforeAll(reset);
afterAll(async () => {
  await prisma.calendar.deleteMany({ where: { id: { in: calendarIds } } });
  await prisma.$disconnect();
});

describe("syncSource", () => {
  it("inserts, then updates by externalId instead of duplicating, and schedules the next run", async () => {
    reset();
    const source = await newSource();
    behaviour.events = [event("a", "First"), event("b", "Second")];
    expect(await syncSource(prisma, source.id, { now: () => NOW })).toEqual({ outcome: "ok" });
    expect((await eventsOf(source.calendarId)).map((e) => e.title)).toEqual(["First", "Second"]);

    behaviour.events = [event("a", "First renamed", { url: "https://example.com/a" })];
    await syncSource(prisma, source.id, { now: () => NOW });
    const rows = await eventsOf(source.calendarId);
    expect(rows.map((e) => e.title)).toEqual(["First renamed", "Second"]);
    expect(rows[0]!.url).toBe("https://example.com/a");

    const after = await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(after.lastSyncAt?.toISOString()).toBe(NOW.toISOString());
    expect(after.nextSyncAt?.toISOString()).toBe("2026-11-14T09:50:00.000Z");
    expect(after.lastSyncError).toBeNull();
    expect(after.state).toEqual({ n: 2 });
  });

  it("removes what the source reports as gone", async () => {
    reset();
    const source = await newSource();
    behaviour.events = [event("a"), event("b")];
    await syncSource(prisma, source.id, { now: () => NOW });
    behaviour.events = [];
    behaviour.remove = ["b"];
    await syncSource(prisma, source.id, { now: () => NOW });
    expect((await eventsOf(source.calendarId)).map((e) => e.externalId)).toEqual(["a"]);
  });

  it("a failed run keeps every event, records the error and tries again later", async () => {
    reset();
    const source = await newSource();
    behaviour.events = [event("a"), event("b")];
    await syncSource(prisma, source.id, { now: () => NOW });

    behaviour.events = [];
    behaviour.remove = ["a", "b"];
    behaviour.fail = new SourceError("unavailable", "The provider is not available now", {
      state: { n: 7 },
    });
    expect(await syncSource(prisma, source.id, { now: () => NOW })).toEqual({ outcome: "error" });

    expect(await eventsOf(source.calendarId)).toHaveLength(2);
    const after = await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(after).toMatchObject({
      lastSyncError: "The provider is not available now",
      lastSyncErrorCode: "unavailable",
      state: { n: 7 },
    });
    // the last success stays the last update; the retry is hours away, not a minute
    expect(after.lastSyncAt?.toISOString()).toBe(NOW.toISOString());
    expect(after.nextSyncAt?.toISOString()).toBe("2026-11-13T16:00:00.000Z");
  });

  it("stops asking after a rejected key, and starts again with a good run", async () => {
    reset();
    const source = await newSource();
    behaviour.fail = new SourceError("key_rejected", "The provider rejected the API key");
    await syncSource(prisma, source.id, { now: () => NOW });
    expect(
      (await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id } })).nextSyncAt,
    ).toBeNull();

    behaviour.fail = null;
    await syncSource(prisma, source.id, { now: () => NOW });
    const after = await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(after.lastSyncError).toBeNull();
    expect(after.lastSyncErrorCode).toBeNull();
  });

  it("waits for the date a source gives after a quota error", async () => {
    reset();
    const source = await newSource();
    behaviour.fail = new SourceError("quota", "The provider's request quota is used up", {
      retryAt: new Date("2026-12-01T00:00:00Z"),
    });
    await syncSource(prisma, source.id, { now: () => NOW });
    expect(
      (
        await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id } })
      ).nextSyncAt?.toISOString(),
    ).toBe("2026-12-01T00:00:00.000Z");
  });

  it("asks for the key again when it cannot be decrypted", async () => {
    reset();
    const source = await newSource({ secret: "v1.AAAA.AAAA.AAAA" });
    expect(await syncSource(prisma, source.id, { now: () => NOW })).toEqual({ outcome: "error" });
    expect(behaviour.calls).toBe(0);
    expect(
      await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id } }),
    ).toMatchObject({
      lastSyncErrorCode: "key_unreadable",
      nextSyncAt: null,
    });
  });

  it("never stores an unexpected error's text, which could hold the key", async () => {
    reset();
    const source = await newSource();
    behaviour.fail = new Error(`boom ${secret}`);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await syncSource(prisma, source.id, { now: () => NOW });
    log.mockRestore();
    const after = await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(after.lastSyncError).not.toContain(secret);
    expect(after.lastSyncErrorCode).toBe("unknown");
  });

  it("scrubs the key out of a source's own error message", async () => {
    reset();
    const source = await newSource();
    behaviour.fail = new SourceError("unknown", `The provider said no to ${secret}`);
    await syncSource(prisma, source.id, { now: () => NOW });
    const after = await prisma.calendarSource.findUniqueOrThrow({ where: { id: source.id } });
    expect(after.lastSyncError).toBe("The provider said no to ***");
  });

  it("keeps only safe links and valid details, and bounds the text", async () => {
    reset();
    const source = await newSource();
    behaviour.events = [
      event("a", "x".repeat(1000), { url: "javascript:alert(1)", details: { note: "ok" } }),
      event("b", "B", { url: "https://example.com/b", details: { wrong: true } }),
      event("c", "  "),
      event("d", "D", {
        start: new Date("2026-11-15T00:00:00Z"),
        end: new Date("2026-11-14T00:00:00Z"),
      }),
    ];
    await syncSource(prisma, source.id, { now: () => NOW });
    const rows = await eventsOf(source.calendarId);
    expect(rows.map((e) => e.externalId)).toEqual(["a", "b"]);
    expect(rows[0]).toMatchObject({ url: null, details: { note: "ok" } });
    expect(rows[0]!.title).toHaveLength(300);
    expect(rows[1]).toMatchObject({ url: "https://example.com/b", details: null });
  });

  it("drops events that ended over a year ago, keeps recent history", async () => {
    reset();
    const source = await newSource();
    await prisma.externalEvent.createMany({
      data: [
        {
          calendarId: source.calendarId,
          externalId: "old",
          title: "Old",
          start: new Date("2025-06-01T00:00:00Z"),
          end: new Date("2025-06-02T00:00:00Z"),
          allDay: true,
        },
        {
          calendarId: source.calendarId,
          externalId: "recent",
          title: "Recent",
          start: new Date("2026-10-01T00:00:00Z"),
          end: new Date("2026-10-02T00:00:00Z"),
          allDay: true,
        },
      ],
    });
    await syncSource(prisma, source.id, { now: () => NOW });
    expect((await eventsOf(source.calendarId)).map((e) => e.externalId)).toEqual(["recent"]);
  });

  it("does not let two runs of one source overlap", async () => {
    reset();
    const source = await newSource();
    let release!: () => void;
    behaviour.wait = new Promise<void>((resolve) => (release = resolve));
    behaviour.events = [event("a")];
    const first = syncSource(prisma, source.id, { now: () => NOW });
    await vi.waitFor(() => expect(behaviour.calls).toBe(1));
    expect(await syncSource(prisma, source.id, { now: () => NOW })).toEqual({ outcome: "busy" });
    release();
    expect(await first).toEqual({ outcome: "ok" });
    expect(behaviour.calls).toBe(1);
  });
});

describe("syncDueSources", () => {
  it("updates only the sources whose time has come, and not paused ones", async () => {
    reset();
    behaviour.events = [event("a")];
    const due = await newSource();
    const later = await newSource({ nextSyncAt: new Date("2026-11-14T00:00:00Z") });
    const paused = await newSource({ enabled: false });
    const result = await syncDueSources(prisma, { now: () => NOW });
    expect(result.synced).toBeGreaterThanOrEqual(1);
    expect(await eventsOf(due.calendarId)).toHaveLength(1);
    expect(await eventsOf(later.calendarId)).toHaveLength(0);
    expect(await eventsOf(paused.calendarId)).toHaveLength(0);
  });

  it("goes on with the others when one fails", async () => {
    reset();
    behaviour.events = [event("a")];
    const broken = await newSource({ kind: "gone" });
    const fine = await newSource();
    await syncDueSources(prisma, { now: () => NOW });
    expect(await eventsOf(fine.calendarId)).toHaveLength(1);
    expect(
      (await prisma.calendarSource.findUniqueOrThrow({ where: { id: broken.id } }))
        .lastSyncErrorCode,
    ).toBe("unknown");
  });
});
