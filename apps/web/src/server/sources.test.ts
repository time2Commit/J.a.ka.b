import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createPrismaClient } from "@jakab/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCard } from "./cards";
import { createStatus } from "./catalog";
import { createCalendar, deleteCalendar } from "./calendars";
import { exportBoard } from "./export";
import { HttpError } from "./errors";
import {
  connectSource,
  disconnectSource,
  listConnectedSources,
  listExternalEvents,
  syncSourceNow,
  updateSource,
  verifySourceCredentials,
} from "./sources";
import { FileSystemStorage } from "./storage";
import { openZipBuffer } from "./zip-reader";

process.env.JAKAB_TEST_SOURCES = "1";

const prisma = createPrismaClient();
const run = Date.now().toString(36);
const calendarIds: string[] = [];
const projectIds: string[] = [];
const KEY = "fake-key-0000-1111";
const NEW_KEY = "other-fake-9999-8888";
let statusId: string;
let storageRoot: string;

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const countries = {
  countryCode: "it",
  name: "Italy",
  services: [{ id: "alphastream", name: "Alpha Stream" }],
};
const changes = (title: string) => ({
  changes: [
    {
      changeType: "new",
      itemType: "show",
      showId: "1",
      showType: "movie",
      service: { name: "Alpha Stream" },
      streamingOptionType: "subscription",
      timestamp: Math.floor(Date.now() / 1000),
    },
  ],
  shows: { "1": { title } },
  hasMore: false,
});
/** A provider that accepts `good` keys only; records what it was asked. */
function provider(good: string[], title = "Fake Film") {
  const seen: { path: string; key: string | null }[] = [];
  const fetchImpl = (async (input: URL, init: RequestInit) => {
    const url = new URL(String(input));
    const key = (init.headers as Record<string, string>)["X-API-Key"] ?? null;
    seen.push({ path: url.pathname, key });
    if (!key || !good.includes(key)) return reply({ message: "Invalid API key" }, 401);
    return reply(url.pathname.includes("/countries/") ? countries : changes(title));
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

const streamingInput = (name: string, key = KEY) => ({
  kind: "streaming-releases",
  credentials: { apiKey: key },
  config: { country: "it", services: ["alphastream"], changes: "new" as const },
  calendar: { name: `${name} ${run}`, color: "#8b5cf6" },
});

async function connect(name: string, deps: Parameters<typeof connectSource>[2]) {
  const dto = await connectSource(prisma, streamingInput(name), deps);
  calendarIds.push(dto.calendarId);
  return dto;
}

beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), "jakab-sources-"));
  statusId = (await createStatus(prisma, { name: `Src ${run}`, color: "#111111", isDone: false }))
    .id;
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  await prisma.calendar.deleteMany({ where: { id: { in: calendarIds } } });
  await prisma.status.deleteMany({ where: { id: statusId } });
  await rm(storageRoot, { recursive: true, force: true });
  await prisma.$disconnect();
});

describe("connecting a source", () => {
  it("creates the calendar and the source, runs a first update, and shows no secret", async () => {
    const { fetchImpl } = provider([KEY]);
    const dto = await connect("Streaming", { fetchImpl });
    expect(dto).toMatchObject({
      kind: "streaming-releases",
      status: "active",
      secretHint: KEY.slice(-4),
      lastSyncError: null,
      usage: { used: 2, limit: 1000 },
    });
    expect(dto.lastSyncAt).not.toBeNull();

    const calendar = await prisma.calendar.findUniqueOrThrow({ where: { id: dto.calendarId } });
    expect(calendar).toMatchObject({ kind: "source", isDefault: false });
    const events = await listExternalEvents(
      prisma,
      new Date(Date.now() - 3 * 86_400_000),
      new Date(Date.now() + 3 * 86_400_000),
    );
    expect(events.filter((e) => e.calendarId === dto.calendarId)).toMatchObject([
      { title: "Fake Film", kind: "streaming-releases", allDay: true },
    ]);

    // The key is stored encrypted and never leaves the server.
    const stored = await prisma.calendarSource.findUniqueOrThrow({ where: { id: dto.id } });
    expect(stored.secret).toBeTruthy();
    expect(stored.secret).not.toContain(KEY);
    expect(JSON.stringify(dto)).not.toContain(KEY);
    expect(JSON.stringify(await listConnectedSources(prisma))).not.toContain(KEY);
    expect(JSON.stringify(events)).not.toContain(KEY);
  });

  it("lists the catalog with the provider's attribution", async () => {
    const { catalog } = await listConnectedSources(prisma);
    expect(catalog.find((s) => s.kind === "streaming-releases")).toMatchObject({
      needsCredentials: true,
      attribution: { url: expect.stringMatching(/^https:/) },
    });
  });

  it("shows a failed first update as an error and keeps the source", async () => {
    const { fetchImpl } = provider([]);
    const dto = await connect("Rejected", { fetchImpl });
    expect(dto).toMatchObject({ status: "key_needed", lastSyncErrorCode: "key_rejected" });
    expect(dto.nextSyncAt).toBeNull();
  });

  it("refuses a name that a calendar already has, creating nothing", async () => {
    const { fetchImpl } = provider([KEY]);
    const taken = await createCalendar(prisma, { name: `Taken ${run}`, color: "#123456" });
    calendarIds.push(taken.id);
    const before = await prisma.calendarSource.count();
    await expect(
      connectSource(prisma, streamingInput("Taken"), { fetchImpl }),
    ).rejects.toMatchObject({ status: 409 });
    expect(await prisma.calendarSource.count()).toBe(before);
  });

  it("refuses an unknown kind and options that do not fit the kind", async () => {
    await expect(
      connectSource(prisma, { ...streamingInput("X"), kind: "nope" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      connectSource(prisma, { ...streamingInput("Y"), config: { services: [] } }),
    ).rejects.toThrow();
    await expect(
      connectSource(prisma, { ...streamingInput("Z"), credentials: { apiKey: "short" } }),
    ).rejects.toThrow();
  });
});

describe("verifying credentials", () => {
  it("returns the options without saving anything", async () => {
    const { fetchImpl, seen } = provider([KEY]);
    const before = await prisma.calendarSource.count();
    const result = await verifySourceCredentials(
      { kind: "streaming-releases", credentials: { apiKey: KEY }, config: {} },
      { fetchImpl },
    );
    expect(result.options).toMatchObject({ country: "it", services: [{ id: "alphastream" }] });
    expect(seen).toEqual([{ path: "/v4/countries/it", key: KEY }]);
    expect(await prisma.calendarSource.count()).toBe(before);
  });

  it("explains a rejected key and an unreachable provider", async () => {
    const rejected = await verifySourceCredentials(
      { kind: "streaming-releases", credentials: { apiKey: KEY }, config: {} },
      { fetchImpl: provider([]).fetchImpl },
    ).catch((e) => e as HttpError);
    expect(rejected).toMatchObject({ status: 422, code: "key_rejected" });
    expect((rejected as HttpError).message).not.toContain(KEY);

    const down = await verifySourceCredentials(
      { kind: "streaming-releases", credentials: { apiKey: KEY }, config: {} },
      {
        fetchImpl: (async () => {
          throw new Error(`connection refused for ${KEY}`);
        }) as unknown as typeof fetch,
      },
    ).catch((e) => e as HttpError);
    expect(down).toMatchObject({ status: 502 });
    expect((down as HttpError).message).not.toContain(KEY);
  });
});

describe("a source calendar", () => {
  it("never holds cards and is not deleted from the calendars list", async () => {
    const dto = await connect("Guarded", { fetchImpl: provider([KEY]).fetchImpl });
    await expect(
      createCard(
        prisma,
        {
          projectName: `Guard ${run}`,
          start: new Date("2026-11-14T09:00:00Z"),
          end: new Date("2026-11-14T10:00:00Z"),
          allDay: false,
          statusId,
          calendarId: dto.calendarId,
          labelIds: [],
          memberIds: [],
        },
        "nobody",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await prisma.project.count({ where: { name: `Guard ${run}` } })).toBe(0);
    await expect(deleteCalendar(prisma, dto.calendarId)).rejects.toMatchObject({ status: 409 });
  });

  it("is not a place for the cards of a calendar that is deleted", async () => {
    const dto = await connect("NotTarget", { fetchImpl: provider([KEY]).fetchImpl });
    const local = await createCalendar(prisma, { name: `Local ${run}`, color: "#123456" });
    calendarIds.push(local.id);
    await expect(deleteCalendar(prisma, local.id, dto.calendarId)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("is left out of a board export", async () => {
    const dto = await connect("Exported", { fetchImpl: provider([KEY]).fetchImpl });
    const { stream } = await exportBoard(prisma, new FileSystemStorage(storageRoot), {
      includeVersions: false,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of Readable.from(stream)) chunks.push(chunk as Buffer);
    const zip = await openZipBuffer(Buffer.concat(chunks));
    const board = (await zip.readBuffer("board.json", 5_000_000)).toString();
    zip.close();
    expect(board).not.toContain(`Exported ${run}`);
    expect(board).not.toContain("Fake Film");
    expect(board).not.toContain(KEY);
    expect(dto.id).toBeTruthy();
  });
});

describe("changing a source", () => {
  it("changed options fetch again from the start and replace the coming events", async () => {
    const first = provider([KEY], "Old Title");
    const dto = await connect("Options", { fetchImpl: first.fetchImpl });
    await prisma.calendarSource.update({
      where: { id: dto.id },
      data: { state: { month: "2026-11", requests: 5, lastFetchedDay: "2026-11-12" } },
    });
    const second = provider([KEY], "New Title");
    const updated = await updateSource(
      prisma,
      dto.id,
      { config: { country: "it", services: ["alphastream", "betaplay"], changes: "new" } },
      { fetchImpl: second.fetchImpl },
    );
    expect(updated.config).toMatchObject({ services: ["alphastream", "betaplay"] });
    const titles = (
      await prisma.externalEvent.findMany({ where: { calendarId: dto.calendarId } })
    ).map((e) => e.title);
    expect(titles).toEqual(["New Title"]);
    expect(second.seen.length).toBeGreaterThan(0);
  });

  it("an unchanged configuration costs no request", async () => {
    const first = provider([KEY]);
    const dto = await connect("Same", { fetchImpl: first.fetchImpl });
    const again = provider([KEY]);
    await updateSource(prisma, dto.id, { config: dto.config }, { fetchImpl: again.fetchImpl });
    expect(again.seen).toHaveLength(0);
  });

  it("pausing stops updates; resuming updates at once", async () => {
    const dto = await connect("Pause", { fetchImpl: provider([KEY]).fetchImpl });
    const paused = await updateSource(prisma, dto.id, { enabled: false });
    expect(paused).toMatchObject({ status: "paused", nextSyncAt: null });
    await expect(syncSourceNow(prisma, dto.id)).rejects.toMatchObject({ status: 409 });

    const probe = provider([KEY]);
    const resumed = await updateSource(
      prisma,
      dto.id,
      { enabled: true },
      { fetchImpl: probe.fetchImpl },
    );
    expect(resumed.status).toBe("active");
    expect(probe.seen.length).toBeGreaterThan(0);
  });

  it("a new key must work before it replaces the old one", async () => {
    const dto = await connect("Replace", { fetchImpl: provider([KEY]).fetchImpl });
    const before = await prisma.calendarSource.findUniqueOrThrow({ where: { id: dto.id } });

    await expect(
      updateSource(
        prisma,
        dto.id,
        { credentials: { apiKey: NEW_KEY } },
        { fetchImpl: provider([KEY]).fetchImpl },
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect((await prisma.calendarSource.findUniqueOrThrow({ where: { id: dto.id } })).secret).toBe(
      before.secret,
    );

    const good = provider([NEW_KEY]);
    const updated = await updateSource(
      prisma,
      dto.id,
      { credentials: { apiKey: NEW_KEY } },
      { fetchImpl: good.fetchImpl },
    );
    expect(updated).toMatchObject({ status: "active", secretHint: NEW_KEY.slice(-4) });
    expect(good.seen.every((r) => r.key === NEW_KEY)).toBe(true);
    expect(JSON.stringify(updated)).not.toContain(NEW_KEY);
  });

  it("a key that was rejected is replaced and the source works again", async () => {
    const dto = await connect("Revive", { fetchImpl: provider([]).fetchImpl });
    expect(dto.status).toBe("key_needed");
    const revived = await updateSource(
      prisma,
      dto.id,
      { credentials: { apiKey: KEY } },
      { fetchImpl: provider([KEY]).fetchImpl },
    );
    expect(revived).toMatchObject({ status: "active", lastSyncError: null });
    expect(revived.nextSyncAt).not.toBeNull();
  });

  it("'update now' runs one pass", async () => {
    const dto = await connect("Now", { fetchImpl: provider([KEY], "First").fetchImpl });
    const next = provider([KEY], "Second");
    const result = await syncSourceNow(prisma, dto.id, { fetchImpl: next.fetchImpl });
    expect(result.status).toBe("active");
    expect(next.seen.length).toBeGreaterThan(0);
  });
});

describe("disconnecting", () => {
  it("removes the calendar, the source and its events, and hides nothing left over", async () => {
    const dto = await connect("Gone", { fetchImpl: provider([KEY]).fetchImpl });
    const user = await prisma.user.create({
      data: {
        id: `u-src-${run}`,
        name: "Src Tester",
        email: `src.${run}@example.com`,
        avatarColor: "#444444",
        hiddenCalendarIds: [dto.calendarId, "other"],
      },
    });
    await disconnectSource(prisma, dto.id);
    expect(await prisma.calendar.count({ where: { id: dto.calendarId } })).toBe(0);
    expect(await prisma.calendarSource.count({ where: { id: dto.id } })).toBe(0);
    expect(await prisma.externalEvent.count({ where: { calendarId: dto.calendarId } })).toBe(0);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).hiddenCalendarIds,
    ).toEqual(["other"]);
    await prisma.user.delete({ where: { id: user.id } });
    await expect(disconnectSource(prisma, dto.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("events of a range", () => {
  it("lists only what touches the range, oldest first", async () => {
    const dto = await connect("Range", { fetchImpl: provider([KEY]).fetchImpl });
    await prisma.externalEvent.createMany({
      data: [
        {
          calendarId: dto.calendarId,
          externalId: "far",
          title: "Far",
          start: new Date("2030-01-01T00:00:00Z"),
          end: new Date("2030-01-02T00:00:00Z"),
          allDay: true,
        },
        {
          calendarId: dto.calendarId,
          externalId: "edge",
          title: "Edge",
          start: new Date("2031-01-01T00:00:00Z"),
          end: new Date("2031-01-02T00:00:00Z"),
          allDay: true,
        },
      ],
    });
    const found = await listExternalEvents(
      prisma,
      new Date("2030-01-01T00:00:00Z"),
      new Date("2031-01-01T00:00:00Z"),
    );
    expect(found.map((e) => e.title)).toEqual(["Far"]);
  });
});
