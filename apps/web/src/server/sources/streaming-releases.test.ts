import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createSourceFetch } from "./http";
import { classifyFailure, MONTHLY_CAP, streamingReleases } from "./streaming-releases";
import { SourceError, type SourceContext } from "./types";

// The answers below are written by hand from the provider's published specification (4.1.0),
// not recorded from the live service: the provider's hosts cannot be reached from where the
// tests run. Fake keys only.
const fixture = (name: string) =>
  JSON.parse(readFileSync(path.join(__dirname, "fixtures/streaming-releases", name), "utf8"));

const NOW = new Date("2026-11-13T10:00:00Z");
const KEY = "fake-key-0000-1111";
const config = {
  country: "it",
  services: ["alphastream", "betaplay"],
  subscriptionOnly: true,
  showType: "both" as const,
  changes: "both" as const,
};
interface TestState {
  month: string;
  requests: number;
  lastFetchedDay: string | null;
}
const fresh: TestState = { month: "2026-11", requests: 0, lastFetchedDay: null };

type Reply = { status?: number; body: unknown };
/** A network that answers by URL path (and `change_type`/`item_type`/`cursor`) from the table. */
function network(answer: (url: URL) => Reply) {
  const requests: { url: URL; key: string | null }[] = [];
  const impl = (async (input: URL, init: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, key: (init.headers as Record<string, string>)["X-API-Key"] ?? null });
    const { status = 200, body } = answer(url);
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  const ctx: SourceContext = {
    fetch: createSourceFetch(streamingReleases.hosts, { impl }),
    now: NOW,
    timeZone: "Europe/Rome",
    signal: new AbortController().signal,
  };
  return { ctx, requests };
}

const normal = (url: URL): Reply => {
  const q = url.searchParams;
  if (url.pathname.endsWith("/countries/it")) return { body: fixture("country-it.json") };
  const key = `${q.get("change_type")}/${q.get("item_type")}`;
  if (key === "new/show") {
    return {
      body: fixture(
        q.get("cursor") ? "changes-new-show-page2.json" : "changes-new-show-page1.json",
      ),
    };
  }
  if (key === "new/season") return { body: fixture("changes-new-season.json") };
  if (key === "upcoming/show") return { body: fixture("changes-upcoming-show.json") };
  return { body: fixture("changes-upcoming-season.json") };
};

const run = async (
  net: ReturnType<typeof network>,
  state: TestState = fresh,
  existing: object[] = [],
) =>
  (await streamingReleases.sync(
    { credentials: { apiKey: KEY }, config, state, existing: existing as never[] },
    net.ctx,
  )) as Awaited<ReturnType<typeof streamingReleases.sync>> & { state: TestState };

describe("streaming releases: verify", () => {
  it("proves the key with one request and lists the services of the country", async () => {
    const net = network(normal);
    const result = (await streamingReleases.verify(
      { credentials: { apiKey: KEY }, config: { country: "it" } },
      net.ctx,
    )) as { country: string; services: { id: string; name: string }[] };
    expect(net.requests).toHaveLength(1);
    expect(net.requests[0]!.url.pathname).toBe("/v4/countries/it");
    expect(net.requests[0]!.key).toBe(KEY);
    expect(result.services).toEqual([
      { id: "alphastream", name: "Alpha Stream" },
      { id: "betaplay", name: "Beta Play" },
    ]);
  });

  it("does not put the key in the address", async () => {
    const net = network(normal);
    await streamingReleases.verify({ credentials: { apiKey: KEY }, config: {} }, net.ctx);
    expect(net.requests[0]!.url.toString()).not.toContain(KEY);
  });

  it("reports a rejected key", async () => {
    const net = network(() => ({ status: 401, body: fixture("error-key.json") }));
    await expect(
      streamingReleases.verify({ credentials: { apiKey: KEY }, config: {} }, net.ctx),
    ).rejects.toMatchObject({ code: "key_rejected" });
  });
});

describe("streaming releases: sync", () => {
  it("asks for subscription catalogs of the chosen services, two queries per kind of item", async () => {
    const net = network(normal);
    await run(net);
    const changes = net.requests.filter((r) => r.url.pathname.endsWith("/changes"));
    // new/show (2 pages), new/season, upcoming/show, upcoming/season
    expect(changes).toHaveLength(5);
    const first = changes[0]!.url.searchParams;
    expect(first.get("country")).toBe("it");
    expect(first.get("catalogs")).toBe("alphastream.subscription,betaplay.subscription");
    expect(first.get("output_language")).toBe("en");
    expect(changes.every((r) => r.key === KEY)).toBe(true);
    expect(changes.every((r) => !r.url.toString().includes(KEY))).toBe(true);
  });

  it("looks a week back the first time, then from the last day fetched, never beyond 31 days", async () => {
    const first = network(normal);
    await run(first);
    const from = (net: ReturnType<typeof network>) =>
      Number(
        net.requests
          .find((r) => r.url.searchParams.get("change_type") === "new")!
          .url.searchParams.get("from"),
      );
    const week = (NOW.getTime() - 7 * 86_400_000) / 1000;
    expect(from(first)).toBeLessThanOrEqual(week);
    expect(from(first)).toBeGreaterThan(week - 2 * 86_400);

    const again = network(normal);
    await run(again, { ...fresh, lastFetchedDay: "2026-11-12" });
    expect(from(again)).toBeGreaterThan(Date.parse("2026-11-11T00:00:00Z") / 1000);

    const old = network(normal);
    await run(old, { ...fresh, lastFetchedDay: "2026-08-01" });
    expect(from(old)).toBe(Math.floor((NOW.getTime() - 30 * 86_400_000) / 1000));
  });

  it("follows the pagination, merges the same title on one day, and skips undated entries", async () => {
    const { events, state } = await run(network(normal));
    const byId = Object.fromEntries(events.map((e) => [e.externalId, e]));
    // two services, one day, one event (shown with the original title when there is one)
    expect(byId["100:0:2026-11-10"]).toMatchObject({
      title: "Il Film d'Esempio",
      allDay: true,
      url: "https://alpha.example.com/title/100",
      details: {
        type: "movie",
        availability: "available",
        services: ["Alpha Stream", "Beta Play"],
      },
    });
    expect(byId["100:0:2026-11-10"]!.start.toISOString()).toBe("2026-11-10T00:00:00.000Z");
    expect(byId["100:0:2026-11-10"]!.end.toISOString()).toBe("2026-11-11T00:00:00.000Z");
    // page 2 was read: the series; the undated entry of page 2 was left out
    expect(byId["200:0:2026-11-12"]).toBeDefined();
    expect(events.filter((e) => e.title === "Another Film").map((e) => e.externalId)).toEqual([
      "300:0:2026-11-11",
      "300:0:2026-11-20",
    ]);
    expect(state.lastFetchedDay).toBe("2026-11-13");
  });

  it("makes an event of a new season, but not of the first season of a series that just arrived", async () => {
    const { events } = await run(network(normal));
    const ids = events.map((e) => e.externalId);
    expect(ids).toContain("200:2:2026-11-09");
    expect(events.find((e) => e.externalId === "200:2:2026-11-09")!.details).toMatchObject({
      type: "series",
      season: 2,
    });
    expect(ids).not.toContain("200:1:2026-11-12");
  });

  it("marks what is yet to come as upcoming", async () => {
    const { events } = await run(network(normal));
    expect(events.find((e) => e.externalId === "300:0:2026-11-20")!.details).toMatchObject({
      availability: "upcoming",
    });
  });

  it("updates an upcoming arrival that has arrived instead of duplicating it", async () => {
    const net = network((url) =>
      url.searchParams.get("change_type") === "new" && url.searchParams.get("item_type") === "show"
        ? {
            body: {
              ...fixture("changes-upcoming-show.json"),
              changes: fixture("changes-upcoming-show.json").changes.map((c: object) => ({
                ...c,
                changeType: "new",
              })),
            },
          }
        : normal(url),
    );
    const before = [
      {
        externalId: "300:0:2026-11-20",
        start: new Date("2026-11-20T00:00:00Z"),
        details: { type: "movie", availability: "upcoming", services: ["Alpha Stream"] },
      },
    ];
    const { events, removeExternalIds } = await run(net, fresh, before);
    const same = events.filter((e) => e.externalId === "300:0:2026-11-20");
    expect(same).toHaveLength(1);
    expect(same[0]!.details).toMatchObject({ availability: "available" });
    expect(removeExternalIds).toEqual([]);
  });

  it("drops an upcoming arrival the provider no longer lists, when the whole list was read", async () => {
    const gone = {
      externalId: "999:0:2026-11-25",
      start: new Date("2026-11-25T00:00:00Z"),
      details: { type: "movie", availability: "upcoming", services: ["Alpha Stream"] },
    };
    const past = {
      externalId: "998:0:2026-11-01",
      start: new Date("2026-11-01T00:00:00Z"),
      details: { type: "movie", availability: "upcoming", services: ["Alpha Stream"] },
    };
    const { removeExternalIds } = await run(network(normal), fresh, [gone, past]);
    expect(removeExternalIds).toEqual(["999:0:2026-11-25"]);
  });

  it("counts every request and starts the count over in a new month", async () => {
    const { state } = await run(network(normal), { ...fresh, requests: 10 });
    expect(state.requests).toBe(10 + 5);
    const next = await run(network(normal), {
      month: "2026-10",
      requests: 880,
      lastFetchedDay: null,
    });
    expect(next.state).toMatchObject({ month: "2026-11", requests: 5 });
  });

  it("skips its run, without calling the provider, once the monthly cap is reached", async () => {
    const net = network(normal);
    const error = (await run(net, { ...fresh, requests: MONTHLY_CAP }).catch(
      (e) => e,
    )) as SourceError;
    expect(error).toBeInstanceOf(SourceError);
    expect(error.code).toBe("quota_cap");
    expect(error.options.retryAt?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(net.requests).toHaveLength(0);
  });

  it("stops at the cap in the middle of a run, and keeps the count", async () => {
    const net = network(normal);
    const error = (await run(net, { ...fresh, requests: MONTHLY_CAP - 2 }).catch(
      (e) => e,
    )) as SourceError;
    expect(error.code).toBe("quota_cap");
    expect(net.requests).toHaveLength(2);
    expect(error.options.state).toMatchObject({ requests: MONTHLY_CAP });
  });

  it("fails with a readable reason for a rejected key or an exhausted quota", async () => {
    const key = (await run(network(() => ({ status: 401, body: fixture("error-key.json") }))).catch(
      (e) => e,
    )) as SourceError;
    expect(key).toMatchObject({ code: "key_rejected" });
    expect(key.message).not.toContain(KEY);
    const quota = (await run(
      network(() => ({ status: 429, body: fixture("error-quota.json") })),
    ).catch((e) => e)) as SourceError;
    expect(quota).toMatchObject({ code: "quota" });
    expect(quota.options.retryAt?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    // the failed request still counts
    expect(quota.options.state).toMatchObject({ requests: 1 });
  });

  it("does not understand an answer of the wrong shape", async () => {
    const error = (await run(network(() => ({ body: { nope: true } }))).catch(
      (e) => e,
    )) as SourceError;
    expect(error).toMatchObject({ code: "invalid_response" });
  });

  it("asks for movies only when told so", async () => {
    const net = network(normal);
    await streamingReleases.sync(
      {
        credentials: { apiKey: KEY },
        config: { ...config, showType: "movie", changes: "new", subscriptionOnly: false },
        state: fresh,
        existing: [],
      },
      net.ctx,
    );
    const changes = net.requests.filter((r) => r.url.pathname.endsWith("/changes"));
    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes.every((r) => r.url.searchParams.get("item_type") === "show")).toBe(true);
    expect(changes.every((r) => r.url.searchParams.get("show_type") === "movie")).toBe(true);
    expect(changes[0]!.url.searchParams.get("catalogs")).toBe("alphastream,betaplay");
  });
});

describe("streaming releases: usage and failures", () => {
  it("reports the month's consumption and when it resumes", () => {
    expect(
      streamingReleases.usage({ month: "2026-11", requests: 312, lastFetchedDay: null }, NOW),
    ).toEqual({
      used: 312,
      limit: 1000,
      resumesAt: null,
    });
    expect(
      streamingReleases
        .usage({ month: "2026-11", requests: 900, lastFetchedDay: null }, NOW)
        ?.resumesAt?.toISOString(),
    ).toBe("2026-12-01T00:00:00.000Z");
    // last month's count does not apply to this one
    expect(
      streamingReleases.usage({ month: "2026-10", requests: 900, lastFetchedDay: null }, NOW)?.used,
    ).toBe(0);
  });

  it("classifies the provider's refusals", () => {
    expect(classifyFailure({ status: 401, body: null }).code).toBe("key_rejected");
    expect(classifyFailure({ status: 403, body: { message: "Quota exceeded" } }).code).toBe(
      "quota",
    );
    expect(classifyFailure({ status: 403, body: { message: "Forbidden" } }).code).toBe(
      "key_rejected",
    );
    expect(classifyFailure({ status: 429, body: null }).code).toBe("quota");
    expect(classifyFailure({ status: 503, body: null }).code).toBe("unavailable");
    expect(classifyFailure({ status: 400, body: { message: "Bad country" } })).toMatchObject({
      code: "unknown",
    });
  });

  it("changing the options makes the next run fetch from the start again", () => {
    expect(
      streamingReleases.resetState({ month: "2026-11", requests: 5, lastFetchedDay: "2026-11-12" }),
    ).toEqual({ month: "2026-11", requests: 5, lastFetchedDay: null });
  });
});
