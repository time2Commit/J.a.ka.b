import type { ZodType } from "zod";
import type { SourceFetch } from "./http";

/**
 * Why a sync failed, so the settings can word it in the person's language. The provider's own text
 * is only ever a fallback.
 */
export type SourceErrorCode =
  | "key_rejected"
  | "key_unreadable"
  | "quota"
  | "quota_cap"
  | "unavailable"
  | "invalid_response"
  | "unknown";

/** Thrown by a source. `state` is the bookkeeping to keep even though the run failed (requests spent). */
export class SourceError extends Error {
  constructor(
    readonly code: SourceErrorCode,
    message: string,
    readonly options: { state?: unknown; retryAt?: Date } = {},
  ) {
    super(message);
  }
}

/** What a source gets to work with: the network door, the clock and a way to stop. */
export interface SourceContext {
  fetch: SourceFetch;
  now: Date;
  /** IANA time zone of the workspace: an all-day event falls on the day it is there. */
  timeZone: string;
  signal: AbortSignal;
}

/** An event as a source describes it; `externalId` is stable across runs. */
export interface SourceEventInput {
  externalId: string;
  title: string;
  start: Date;
  /** Exclusive for an all-day event. */
  end: Date;
  allDay: boolean;
  /** Only `http:` and `https:` addresses are kept. */
  url?: string | null;
  details?: unknown;
}

/** An event already saved, handed back to the source so it can update or drop it. */
export interface ExistingEvent {
  externalId: string;
  start: Date;
  details: unknown;
}

export interface SyncInput<Credentials, Config, State> {
  credentials: Credentials;
  config: Config;
  state: State;
  existing: ExistingEvent[];
}

export interface SyncResult<State> {
  events: SourceEventInput[];
  /** Saved events the provider no longer reports. */
  removeExternalIds?: string[];
  state: State;
}

/** How much of the provider's monthly allowance has been used. */
export interface SourceUsage {
  used: number;
  limit: number;
  /** When a source that stopped on its own cap starts again. */
  resumesAt: Date | null;
}

/** What a source declares about itself and the two things it can do. */
export interface SourceDefinition<Credentials, Config, State, VerifyConfig = Partial<Config>> {
  /** Key in the registry; stored in `CalendarSource.kind`. */
  kind: string;
  name: string;
  attribution: { name: string; url: string };
  /** The only hosts the source may contact. */
  hosts: readonly string[];
  /** How often it is updated, in hours. */
  intervalHours: number;
  /** null: the source needs no credentials. */
  credentialsSchema: ZodType<Credentials> | null;
  configSchema: ZodType<Config>;
  /** What `verify` gets of the options: they are not all chosen yet when the credentials are tried. */
  verifyConfigSchema: ZodType<VerifyConfig>;
  stateSchema: ZodType<State>;
  initialState: () => State;
  /** The part of the credentials that may be shown after they were saved (their last letters). */
  hint?: (credentials: Credentials) => string;
  detailsSchema: ZodType<unknown>;
  /** Proves the credentials work with one call and returns what the connect dialog needs. */
  verify: (
    input: { credentials: Credentials; config: VerifyConfig },
    ctx: SourceContext,
  ) => Promise<unknown>;
  sync: (
    input: SyncInput<Credentials, Config, State>,
    ctx: SourceContext,
  ) => Promise<SyncResult<State>>;
  /** The options changed: what the new options need to be fetched again from scratch. */
  resetState?: (state: State) => State;
  usage?: (state: State, now: Date) => SourceUsage | null;
}

/** A definition with its types erased: what the registry stores and the rest of the app uses. */
export interface Source {
  kind: string;
  name: string;
  attribution: { name: string; url: string };
  hosts: readonly string[];
  intervalHours: number;
  needsCredentials: boolean;
  parseCredentials: (input: unknown) => unknown;
  parseConfig: (input: unknown) => Record<string, unknown>;
  parseState: (input: unknown) => unknown;
  hint: (credentials: unknown) => string | null;
  parseDetails: (input: unknown) => Record<string, unknown> | null;
  verify: (
    input: { credentials: unknown; config: unknown },
    ctx: SourceContext,
  ) => Promise<unknown>;
  sync: (
    input: { credentials: unknown; config: unknown; state: unknown; existing: ExistingEvent[] },
    ctx: SourceContext,
  ) => Promise<SyncResult<unknown>>;
  resetState: (state: unknown) => unknown;
  usage: (state: unknown, now: Date) => SourceUsage | null;
}

/** Wraps a definition so every input is parsed by its own schema before the source sees it. */
export function defineSource<Credentials, Config, State, VerifyConfig>(
  def: SourceDefinition<Credentials, Config, State, VerifyConfig>,
): Source {
  const credentials = (input: unknown) =>
    def.credentialsSchema ? def.credentialsSchema.parse(input) : ({} as Credentials);
  const state = (input: unknown) => {
    const parsed = def.stateSchema.safeParse(input);
    return parsed.success ? parsed.data : def.initialState();
  };
  return {
    kind: def.kind,
    name: def.name,
    attribution: def.attribution,
    hosts: def.hosts,
    intervalHours: def.intervalHours,
    needsCredentials: def.credentialsSchema !== null,
    parseCredentials: credentials,
    parseConfig: (input) => def.configSchema.parse(input) as Record<string, unknown>,
    parseState: state,
    hint: (input) => (def.hint ? def.hint(credentials(input)) : null),
    parseDetails: (input) => {
      const parsed = def.detailsSchema.safeParse(input);
      return parsed.success ? (parsed.data as Record<string, unknown>) : null;
    },
    verify: (input, ctx) =>
      def.verify(
        {
          credentials: credentials(input.credentials),
          config: def.verifyConfigSchema.parse(input.config),
        },
        ctx,
      ),
    sync: (input, ctx) =>
      def.sync(
        {
          credentials: credentials(input.credentials),
          config: def.configSchema.parse(input.config),
          state: state(input.state),
          existing: input.existing,
        },
        ctx,
      ),
    resetState: (input) => (def.resetState ? def.resetState(state(input)) : state(input)),
    usage: (input, now) => (def.usage ? def.usage(state(input), now) : null),
  };
}
