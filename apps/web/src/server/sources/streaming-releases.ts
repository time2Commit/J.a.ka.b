import {
  STREAMING_RELEASES_KIND,
  streamingReleaseDetailsSchema,
  streamingReleasesConfigSchema,
  streamingReleasesCredentialsSchema,
  type StreamingReleaseDetails,
  type StreamingReleasesConfig,
  type StreamingReleasesVerifyOptions,
} from "@jakab/shared";
import { z } from "zod";
import { dayInZone, dayStartUtc, monthOf, nextDayStartUtc, startOfNextMonth } from "./days";
import { SourceHttpError, type SourceResponse } from "./http";
import {
  defineSource,
  SourceError,
  type SourceContext,
  type SourceEventInput,
  type SourceErrorCode,
} from "./types";

/**
 * Streaming arrivals: what just arrived and what is about to arrive on the streaming services of a
 * country (not cinema releases). The one place this provider is named in code; the rest of the app
 * only knows the generic source interface.
 *
 * Provider limits this file works around (spec 4.1.0): the free plan allows 1,000 requests a month
 * and then blocks; a query reaches back or forward 31 days at most; titles are available in
 * English, Spanish, Turkish and French only; upcoming arrivals exist for six services.
 */

const BASE = "https://api.movieofthenight.com/v4";
const HOST = "api.movieofthenight.com";

/** The plan's monthly allowance and the cap the source stops at, so a miscount cannot lock the key. */
export const MONTHLY_LIMIT = 1000;
export const MONTHLY_CAP = 900;
/** Pages (25 changes each) read per query in one run. */
const MAX_PAGES = 6;
/** Days back on the very first run: a month of history costs far more requests than it is worth. */
const FIRST_RUN_DAYS = 7;
/** Events kept per run, a bound against a runaway answer. */
const MAX_EVENTS = 3000;

const stateSchema = z.object({
  /** The month (yyyy-MM, UTC) the request count refers to. */
  month: z.string(),
  requests: z.number().int().min(0),
  /** The last day (in the workspace time zone) whose new arrivals were fetched. */
  lastFetchedDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});
type State = z.infer<typeof stateSchema>;

const countrySchema = z.object({
  countryCode: z.string().optional(),
  services: z.array(z.object({ id: z.string(), name: z.string() })),
});

const changesSchema = z.object({
  changes: z.array(
    z.object({
      changeType: z.string(),
      itemType: z.string(),
      showId: z.string(),
      showType: z.enum(["movie", "series"]),
      season: z.number().int().optional(),
      service: z.object({ name: z.string() }),
      timestamp: z.number().optional(),
      link: z.string().nullish(),
    }),
  ),
  shows: z.record(
    z.string(),
    z.object({ title: z.string().optional(), originalTitle: z.string().optional() }),
  ),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

/** Maps the provider's answer to a failure a person can read (the provider's own text never leaks the key). */
export function classifyFailure(response: SourceResponse): {
  code: SourceErrorCode;
  message: string;
} {
  const { status, body } = response;
  const text =
    typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message)
      : "";
  if (status === 401) return { code: "key_rejected", message: "The provider rejected the API key" };
  if (status === 403 || status === 402) {
    return /quota|limit|exceed/i.test(text)
      ? { code: "quota", message: "The provider's request quota is used up" }
      : { code: "key_rejected", message: "The provider rejected the API key" };
  }
  if (status === 429) return { code: "quota", message: "The provider's request quota is used up" };
  if (status >= 500) return { code: "unavailable", message: "The provider is not available now" };
  return {
    code: "unknown",
    message: `The provider refused the request (${status})${text ? `: ${text.slice(0, 120)}` : ""}`,
  };
}

/** Counts a request, refusing to go past the cap, and sends it. */
async function call(url: URL, apiKey: string, state: State, ctx: SourceContext): Promise<unknown> {
  if (state.requests >= MONTHLY_CAP) {
    throw new SourceError("quota_cap", "The monthly request cap was reached", {
      state,
      retryAt: startOfNextMonth(ctx.now),
    });
  }
  // Counted before sending: a request that fails halfway may still have used some allowance.
  state.requests++;
  let response: SourceResponse;
  try {
    response = await ctx.fetch(url.toString(), { headers: { "X-API-Key": apiKey } });
  } catch (error) {
    throw new SourceError(
      "unavailable",
      error instanceof SourceHttpError ? error.message : "The provider could not be reached",
      { state },
    );
  }
  if (response.status < 200 || response.status >= 300) {
    const { code, message } = classifyFailure(response);
    throw new SourceError(code, message, {
      state,
      retryAt: code === "quota" ? startOfNextMonth(ctx.now) : undefined,
    });
  }
  return response.body;
}

interface Group {
  externalId: string;
  title: string;
  day: string;
  showLevel: boolean;
  type: "movie" | "series";
  season?: number;
  available: boolean;
  services: Set<string>;
  url: string | null;
}

export const streamingReleases = defineSource({
  kind: STREAMING_RELEASES_KIND,
  name: "Movie of the Night",
  attribution: { name: "Movie of the Night", url: "https://www.movieofthenight.com/" },
  hosts: [HOST],
  intervalHours: 24,
  credentialsSchema: streamingReleasesCredentialsSchema,
  configSchema: streamingReleasesConfigSchema,
  verifyConfigSchema: streamingReleasesConfigSchema.partial(),
  stateSchema,
  initialState: (): State => ({ month: "", requests: 0, lastFetchedDay: null }),
  hint: ({ apiKey }) => apiKey.slice(-4),
  detailsSchema: streamingReleaseDetailsSchema,
  resetState: (state) => ({ ...state, lastFetchedDay: null }),
  usage: (state, now) => {
    const used = state.month === monthOf(now) ? state.requests : 0;
    return {
      used,
      limit: MONTHLY_LIMIT,
      resumesAt: used >= MONTHLY_CAP ? startOfNextMonth(now) : null,
    };
  },

  async verify({ credentials, config }, ctx): Promise<StreamingReleasesVerifyOptions> {
    const country = config.country ?? "it";
    const url = new URL(`${BASE}/countries/${country}`);
    url.searchParams.set("output_language", "en");
    // The source does not exist yet, so this one request is not in any counter; it is spent all the same.
    const body = await call(
      url,
      credentials.apiKey,
      { month: "", requests: 0, lastFetchedDay: null },
      ctx,
    );
    const parsed = countrySchema.safeParse(body);
    if (!parsed.success) {
      throw new SourceError("invalid_response", "The provider's answer was not understood");
    }
    return {
      country,
      services: parsed.data.services.slice(0, 100).map(({ id, name }) => ({ id, name })),
    };
  },

  async sync({ credentials, config, state: saved, existing }, ctx) {
    const state: State = {
      ...saved,
      requests: saved.month === monthOf(ctx.now) ? saved.requests : 0,
      month: monthOf(ctx.now),
    };
    if (state.requests >= MONTHLY_CAP) {
      throw new SourceError("quota_cap", "The monthly request cap was reached", {
        state,
        retryAt: startOfNextMonth(ctx.now),
      });
    }

    const today = dayInZone(ctx.now, ctx.timeZone);
    const queries = planQueries(config);
    const groups = new Map<string, Group>();
    let newComplete = true;
    let resumeDay: string | null = null;
    let upcomingComplete = true;

    for (const query of queries) {
      let cursor: string | undefined;
      let lastTimestamp: number | undefined;
      for (let page = 0; ; page++) {
        const url = new URL(`${BASE}/changes`);
        const p = url.searchParams;
        p.set("country", config.country);
        p.set(
          "catalogs",
          config.services
            .map((id) => (config.subscriptionOnly ? `${id}.subscription` : id))
            .join(","),
        );
        p.set("change_type", query.change);
        p.set("item_type", query.item);
        if (query.item === "show" && config.showType !== "both")
          p.set("show_type", config.showType);
        if (query.change === "new")
          p.set("from", String(fromSeconds(saved, ctx.now, ctx.timeZone)));
        p.set("order_direction", "asc");
        p.set("output_language", "en");
        if (cursor) p.set("cursor", cursor);

        const parsed = changesSchema.safeParse(await call(url, credentials.apiKey, state, ctx));
        if (!parsed.success) {
          throw new SourceError("invalid_response", "The provider's answer was not understood", {
            state,
          });
        }
        const { changes, shows, hasMore, nextCursor } = parsed.data;
        for (const change of changes) {
          if (change.timestamp === undefined) continue; // no known date: nothing to put on a calendar
          lastTimestamp = change.timestamp;
          collect(groups, change, shows[change.showId], ctx.timeZone, query.change === "new");
        }
        if (!hasMore || !nextCursor) break;
        if (page + 1 >= MAX_PAGES) {
          // Cut short: next time, new arrivals resume from where this one stopped.
          if (query.change === "new") {
            newComplete = false;
            const day = lastTimestamp
              ? dayInZone(new Date(lastTimestamp * 1000), ctx.timeZone)
              : null;
            if (day && (resumeDay === null || day < resumeDay)) resumeDay = day;
          } else {
            upcomingComplete = false;
          }
          break;
        }
        cursor = nextCursor;
      }
    }

    const events = toEvents(groups, existing);
    const fetched = new Set(events.map((e) => e.externalId));
    // Upcoming arrivals the provider no longer lists (cancelled or moved) are dropped, but only
    // when the whole list was read: a cut-short answer proves nothing.
    const runsUpcoming = queries.some((q) => q.change === "upcoming");
    const removeExternalIds =
      runsUpcoming && upcomingComplete
        ? existing
            .filter((e) => {
              const details = streamingReleaseDetailsSchema.safeParse(e.details);
              return (
                details.success &&
                details.data.availability === "upcoming" &&
                dayInZone(e.start, "UTC") >= today &&
                !fetched.has(e.externalId)
              );
            })
            .map((e) => e.externalId)
        : [];

    return {
      events: events.slice(0, MAX_EVENTS),
      removeExternalIds,
      state: {
        ...state,
        lastFetchedDay: queries.some((q) => q.change === "new")
          ? newComplete
            ? today
            : (resumeDay ?? saved.lastFetchedDay)
          : saved.lastFetchedDay,
      },
    };
  },
});

interface Query {
  change: "new" | "upcoming";
  item: "show" | "season";
}

/** Two to four interrogations: new and/or upcoming, for shows and (when series count) seasons. */
function planQueries(config: StreamingReleasesConfig): Query[] {
  const changes = config.changes === "both" ? (["new", "upcoming"] as const) : [config.changes];
  const items = config.showType === "movie" ? (["show"] as const) : (["show", "season"] as const);
  return changes.flatMap((change) => items.map((item) => ({ change, item })));
}

/** Where the new arrivals start: the last day fetched (a day of overlap is harmless), or a week back. */
function fromSeconds(state: State, now: Date, timeZone: string) {
  const oldest = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const startDay =
    state.lastFetchedDay ??
    dayInZone(new Date(now.getTime() - FIRST_RUN_DAYS * 86_400_000), timeZone);
  // 14 hours before midnight UTC reaches the start of that day in any time zone.
  const start = dayStartUtc(startDay).getTime() - 14 * 60 * 60 * 1000;
  return Math.floor(Math.max(start, oldest) / 1000);
}

function collect(
  groups: Map<string, Group>,
  change: z.infer<typeof changesSchema>["changes"][number],
  show: { title?: string; originalTitle?: string } | undefined,
  timeZone: string,
  isNew: boolean,
) {
  // Single episodes are never requested; this is a guard against the provider sending them anyway.
  if (change.itemType !== "show" && change.itemType !== "season") return;
  const title = (show?.originalTitle || show?.title || "").trim();
  if (!title) return;
  const day = dayInZone(new Date(change.timestamp! * 1000), timeZone);
  const showLevel = change.itemType === "show";
  const season = showLevel ? undefined : change.season;
  const externalId = `${change.showId}:${season ?? 0}:${day}`;
  const group = groups.get(externalId) ?? {
    externalId,
    title,
    day,
    showLevel,
    type: change.showType,
    season,
    available: false,
    services: new Set<string>(),
    url: null,
  };
  group.services.add(change.service.name);
  group.available ||= isNew;
  group.url ??= change.link ?? null;
  groups.set(externalId, group);
}

function toEvents(
  groups: Map<string, Group>,
  existing: { externalId: string; details: unknown }[],
): SourceEventInput[] {
  const before = new Map(existing.map((e) => [e.externalId, e.details]));
  // A new series arrives with its first season: keep the series, drop the season of the same day.
  const showDays = new Set(
    [...groups.values()]
      .filter((g) => g.showLevel && g.type === "series")
      .map((g) => `${g.externalId.split(":")[0]}:${g.day}`),
  );
  const events: SourceEventInput[] = [];
  for (const group of groups.values()) {
    if (!group.showLevel && showDays.has(`${group.externalId.split(":")[0]}:${group.day}`))
      continue;
    const old = streamingReleaseDetailsSchema.safeParse(before.get(group.externalId));
    const services = [
      ...new Set([...(old.success ? old.data.services : []), ...group.services]),
    ].sort();
    const details: StreamingReleaseDetails = {
      type: group.type,
      ...(group.season !== undefined && { season: group.season }),
      // What already arrived stays arrived, even if the provider still lists it as upcoming.
      availability:
        group.available || (old.success && old.data.availability === "available")
          ? "available"
          : "upcoming",
      services,
    };
    events.push({
      externalId: group.externalId,
      title: group.title,
      start: dayStartUtc(group.day),
      end: nextDayStartUtc(group.day),
      allDay: true,
      url: group.url,
      details,
    });
  }
  return events;
}
