import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #rrggbb color");

// ---------------------------------------------------------------------------
// Generic source API: the options and credentials of every kind are validated on the server by the
// zod schemas of the kind's definition; here they only have to be plain objects.
// ---------------------------------------------------------------------------

const plainObject = z.record(z.string(), z.unknown());
const kind = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/);

/**
 * Tries credentials with one call to the provider: new ones typed in the connect dialog, or the
 * ones already stored for a connected source (to list the provider's options again).
 */
export const sourceVerifySchema = z.union([
  z.object({ sourceId: z.string().min(1), config: plainObject.optional() }),
  z.object({
    kind,
    credentials: plainObject.default({}),
    config: plainObject.default({}),
  }),
]);

export const sourceConnectSchema = z.object({
  kind,
  credentials: plainObject.default({}),
  config: plainObject.default({}),
  /** Name and color of the calendar that is created together with the source. */
  calendar: z.object({ name: z.string().trim().min(1).max(40), color: hexColor }),
});

export const sourceUpdateSchema = z
  .object({
    config: plainObject,
    /** false pauses the source: no more updates until it is resumed. */
    enabled: z.boolean(),
    /** A new key (or other credentials) replacing the stored ones; checked before it is saved. */
    credentials: plainObject,
  })
  .partial();

export const externalEventRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

export type SourceVerifyInput = z.infer<typeof sourceVerifySchema>;
export type SourceConnectInput = z.infer<typeof sourceConnectSchema>;
export type SourceUpdateInput = z.infer<typeof sourceUpdateSchema>;

/** What a source needs to be in to be updated. `key_needed`: the credentials must be entered again. */
export type SourceStatus = "active" | "paused" | "error" | "key_needed";

/** An entry of the catalog: a source an admin can connect. */
export interface SourceCatalogEntry {
  kind: string;
  /** Name of the provider; the only place a provider is named besides its attribution. */
  name: string;
  /** What the provider requires us to show wherever its data appears. */
  attribution: { name: string; url: string };
  /** Whether the source asks for credentials (an API key). */
  needsCredentials: boolean;
}

/** A connected source as the settings show it. Never carries the credentials. */
export interface SourceDto {
  id: string;
  kind: string;
  calendarId: string;
  config: Record<string, unknown>;
  status: SourceStatus;
  /** Last characters of the credentials (the rest is never shown), or null when there are none. */
  secretHint: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  lastSyncErrorCode: string | null;
  nextSyncAt: string | null;
  /** Consumption of the provider's quota in the current month, when the provider has one. */
  usage: { used: number; limit: number; resumesAt: string | null } | null;
}

export interface SourceListDto {
  catalog: SourceCatalogEntry[];
  sources: SourceDto[];
}

/** A read-only event of a source calendar. */
export interface ExternalEventDto {
  id: string;
  calendarId: string;
  kind: string;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  url: string | null;
  details: Record<string, unknown> | null;
}

/** What the board needs to know about the source behind a calendar (everyone may read it). */
export interface CalendarSourceInfo {
  kind: string;
  /** What the provider requires us to show wherever its data appears. */
  attribution: { name: string; url: string };
  /** The last update failed: the calendar may be out of date. */
  failed: boolean;
}

/** What `verify` returns: a kind-specific object the connect dialog uses to offer the options. */
export interface SourceVerifyResult {
  options: unknown;
}

// ---------------------------------------------------------------------------
// The streaming-releases source (new and upcoming arrivals on streaming services).
// ---------------------------------------------------------------------------

export const STREAMING_RELEASES_KIND = "streaming-releases";

export const streamingReleasesCredentialsSchema = z.object({
  /** Printable ASCII only: it travels in an HTTP header. */
  apiKey: z
    .string()
    .trim()
    .min(8)
    .max(200)
    .regex(/^[\x21-\x7e]+$/, "Expected a key without spaces"),
});

export const streamingReleasesConfigSchema = z.object({
  /** ISO 3166-1 alpha-2, lower case. */
  country: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{2}$/)
    .default("it"),
  /** Ids of the services to follow, as the provider lists them for the country. */
  services: z
    .array(z.string().regex(/^[a-z0-9._-]{1,40}$/))
    .min(1)
    .max(30),
  /** Only titles included in the subscription (not rent or purchase). */
  subscriptionOnly: z.boolean().default(true),
  showType: z.enum(["both", "movie", "series"]).default("both"),
  changes: z.enum(["both", "new", "upcoming"]).default("both"),
});

export const streamingReleaseDetailsSchema = z.object({
  type: z.enum(["movie", "series"]),
  /** Set when the event is a new season of a series. */
  season: z.number().int().min(0).optional(),
  availability: z.enum(["available", "upcoming"]),
  /** Names of the services (an arrival on several services on one day is one event). */
  services: z.array(z.string().max(60)).max(30),
});

/** What the board needs to know about the source behind a calendar (everyone may read it). */
export interface CalendarSourceInfo {
  kind: string;
  /** What the provider requires us to show wherever its data appears. */
  attribution: { name: string; url: string };
  /** The last update failed: the calendar may be out of date. */
  failed: boolean;
}

/** What `verify` returns for this kind: the services the provider has in the country. */
export interface StreamingReleasesVerifyOptions {
  country: string;
  services: { id: string; name: string }[];
}

export type StreamingReleasesConfig = z.infer<typeof streamingReleasesConfigSchema>;
export type StreamingReleaseDetails = z.infer<typeof streamingReleaseDetailsSchema>;
