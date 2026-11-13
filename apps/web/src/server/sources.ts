import type { Prisma, PrismaClient } from "@jakab/db";
import type {
  CalendarSourceInfo,
  ExternalEventDto,
  SourceCatalogEntry,
  SourceConnectInput,
  SourceDto,
  SourceListDto,
  SourceStatus,
  SourceUpdateInput,
  SourceVerifyInput,
} from "@jakab/shared";
import { badRequest, conflict, HttpError, notFound } from "./errors";
import { notifyBoardChanged } from "./notify";
import { createSourceFetch, SourceHttpError } from "./sources/http";
import { getSource, listSources } from "./sources/registry";
import { dayInZone, dayStartUtc } from "./sources/days";
import { decryptSecret, encryptSecret, SecretUnreadable } from "./sources/secret-box";
import { syncSource, type SyncDeps } from "./sources/sync";
import { SourceError, type Source } from "./sources/types";
import { getWorkspace } from "./workspace";

type SourceRow = Prisma.CalendarSourceGetPayload<object>;

function definitionOf(kind: string): Source {
  const def = getSource(kind);
  if (!def) throw badRequest("Unknown kind of source");
  return def;
}

const toCatalogEntry = (s: Source): SourceCatalogEntry => ({
  kind: s.kind,
  name: s.name,
  attribution: s.attribution,
  needsCredentials: s.needsCredentials,
});

function statusOf(row: SourceRow): SourceStatus {
  if (!row.enabled) return "paused";
  if (row.lastSyncErrorCode === "key_rejected" || row.lastSyncErrorCode === "key_unreadable") {
    return "key_needed";
  }
  return row.lastSyncError ? "error" : "active";
}

/** A source as the settings see it: everything but the credentials. */
export function toSourceDto(row: SourceRow, now = new Date()): SourceDto {
  const usage = getSource(row.kind)?.usage(row.state, now) ?? null;
  return {
    id: row.id,
    kind: row.kind,
    calendarId: row.calendarId,
    config: (row.config ?? {}) as Record<string, unknown>,
    status: statusOf(row),
    secretHint: row.secretHint,
    lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
    lastSyncError: row.lastSyncError,
    lastSyncErrorCode: row.lastSyncErrorCode,
    nextSyncAt: row.nextSyncAt?.toISOString() ?? null,
    usage: usage && {
      used: usage.used,
      limit: usage.limit,
      resumesAt: usage.resumesAt?.toISOString() ?? null,
    },
  };
}

export async function listConnectedSources(db: PrismaClient): Promise<SourceListDto> {
  const rows = await db.calendarSource.findMany({ orderBy: { createdAt: "asc" } });
  return { catalog: listSources().map(toCatalogEntry), sources: rows.map((r) => toSourceDto(r)) };
}

async function getRow(db: PrismaClient, id: string) {
  const row = await db.calendarSource.findUnique({ where: { id } });
  if (!row) throw notFound("Source");
  return row;
}

/**
 * Tries credentials with one call to the provider; nothing is saved. With `sourceId` the stored
 * credentials of a connected source are used (to list the provider's options again).
 */
export async function verifySource(
  db: PrismaClient,
  input: SourceVerifyInput,
  deps: SyncDeps = {},
) {
  if (!("sourceId" in input)) return verifySourceCredentials(input, deps);
  const row = await getRow(db, input.sourceId);
  const def = definitionOf(row.kind);
  let credentials: unknown = {};
  try {
    if (def.needsCredentials) {
      if (!row.secret) throw new SecretUnreadable();
      credentials = JSON.parse(decryptSecret(row.secret));
    }
  } catch {
    throw new HttpError(422, "The stored key cannot be read: enter it again", "key_unreadable");
  }
  return verifySourceCredentials(
    { kind: row.kind, credentials, config: input.config ?? row.config },
    deps,
  );
}

/** Tries credentials with one call to the provider; nothing is saved. */
export async function verifySourceCredentials(
  input: { kind: string; credentials: unknown; config: unknown },
  deps: SyncDeps = {},
) {
  const def = definitionOf(input.kind);
  const signal = AbortSignal.timeout(30_000);
  const ctx = {
    fetch: createSourceFetch(def.hosts, { impl: deps.fetchImpl, signal }),
    now: (deps.now ?? (() => new Date()))(),
    timeZone: "UTC",
    signal,
  };
  try {
    return {
      options: await def.verify({ credentials: input.credentials, config: input.config }, ctx),
    };
  } catch (error) {
    throw toHttpError(error);
  }
}

/** A failed verification becomes an error the admin can read (never the provider's raw text). */
function toHttpError(error: unknown) {
  if (error instanceof SourceError) {
    const status = error.code === "key_rejected" ? 422 : error.code === "quota" ? 429 : 502;
    return new HttpError(status, error.message, error.code);
  }
  if (error instanceof SourceHttpError) {
    return new HttpError(502, error.message, "unavailable");
  }
  return error;
}

function secretOf(def: Source, credentials: unknown) {
  if (!def.needsCredentials) return { secret: null, secretHint: null };
  return {
    secret: encryptSecret(JSON.stringify(credentials)),
    secretHint: def.hint(credentials),
  };
}

/**
 * Connects a source: its calendar and the source itself are created together, then the first
 * update runs. The credentials were tried with `verifySourceCredentials` before, in the dialog.
 */
export async function connectSource(
  db: PrismaClient,
  input: SourceConnectInput,
  deps: SyncDeps = {},
) {
  const def = definitionOf(input.kind);
  const credentials = def.parseCredentials(input.credentials);
  const config = def.parseConfig(input.config);
  if (
    await db.calendar.findUnique({ where: { name: input.calendar.name }, select: { id: true } })
  ) {
    throw conflict("A calendar with this name already exists");
  }
  const now = (deps.now ?? (() => new Date()))();
  const row = await db.$transaction(async (tx) => {
    const last = await tx.calendar.findFirst({ orderBy: { order: "desc" } });
    const calendar = await tx.calendar.create({
      data: { ...input.calendar, kind: "source", order: (last?.order ?? -1) + 1 },
    });
    const source = await tx.calendarSource.create({
      data: {
        kind: def.kind,
        calendarId: calendar.id,
        config: config as Prisma.InputJsonValue,
        ...secretOf(def, credentials),
        state: def.parseState(null) as Prisma.InputJsonValue,
        nextSyncAt: now,
      },
    });
    await notifyBoardChanged(tx, "calendar", calendar.id);
    return source;
  });
  await syncSource(db, row.id, deps);
  return toSourceDto(await getRow(db, row.id), now);
}

/** Changes the options, pauses or resumes, or replaces the credentials of a source. */
export async function updateSource(
  db: PrismaClient,
  id: string,
  input: SourceUpdateInput,
  deps: SyncDeps = {},
) {
  const row = await getRow(db, id);
  const def = definitionOf(row.kind);
  const now = (deps.now ?? (() => new Date()))();
  const data: Prisma.CalendarSourceUpdateInput = {};
  let syncNow = false;
  let dropFutureEvents: Date | null = null;

  if (input.credentials !== undefined) {
    if (!def.needsCredentials) throw badRequest("This source has no credentials");
    const credentials = def.parseCredentials(input.credentials);
    // The new key must work before it replaces the old one.
    await verifySourceCredentials({ kind: row.kind, credentials, config: row.config }, deps);
    Object.assign(data, secretOf(def, credentials), {
      lastSyncError: null,
      lastSyncErrorCode: null,
    });
    syncNow = true;
  }

  if (input.config !== undefined) {
    const config = def.parseConfig(input.config);
    if (JSON.stringify(config) !== JSON.stringify(def.parseConfig(row.config))) {
      data.config = config as Prisma.InputJsonValue;
      data.state = def.resetState(row.state) as Prisma.InputJsonValue;
      // What the old options fetched from today on is replaced by what the new ones fetch; the
      // removal and the new options are saved together.
      const today = dayStartUtc(dayInZone(now, (await getWorkspace(db)).timeZone));
      dropFutureEvents = today;
      syncNow = true;
    }
  }

  if (input.enabled !== undefined && input.enabled !== row.enabled) {
    data.enabled = input.enabled;
    if (input.enabled) syncNow = true;
    else data.nextSyncAt = null;
  }

  const enabled = input.enabled ?? row.enabled;
  if (syncNow && enabled) data.nextSyncAt = now;
  if (Object.keys(data).length > 0) {
    await db.$transaction(async (tx) => {
      if (dropFutureEvents) {
        await tx.externalEvent.deleteMany({
          where: { calendarId: row.calendarId, start: { gte: dropFutureEvents } },
        });
      }
      await tx.calendarSource.update({ where: { id }, data });
      await notifyBoardChanged(tx, "source", id);
    });
  }
  if (syncNow && enabled) await syncSource(db, id, deps);
  return toSourceDto(await getRow(db, id), now);
}

/** "Update now": one run, whatever the schedule says. */
export async function syncSourceNow(db: PrismaClient, id: string, deps: SyncDeps = {}) {
  const row = await getRow(db, id);
  if (!row.enabled) throw conflict("This source is paused");
  const { outcome } = await syncSource(db, id, deps);
  if (outcome === "busy") throw conflict("This source is being updated right now");
  return toSourceDto(await getRow(db, id), deps.now?.() ?? new Date());
}

/** Disconnects: deletes the calendar, which takes the source and its events with it. */
export async function disconnectSource(db: PrismaClient, id: string) {
  const row = await getRow(db, id);
  await db.$transaction(async (tx) => {
    // Nobody keeps a hidden-calendar entry for a calendar that no longer exists.
    await tx.$executeRaw`UPDATE "user" SET "hiddenCalendarIds" = array_remove("hiddenCalendarIds", ${row.calendarId})`;
    await tx.calendar.delete({ where: { id: row.calendarId } });
    await notifyBoardChanged(tx, "calendar", row.calendarId);
  });
  return { calendarId: row.calendarId };
}

/** The events of every source calendar that touch `[from, to)`. */
export async function listExternalEvents(
  db: PrismaClient,
  from: Date,
  to: Date,
): Promise<ExternalEventDto[]> {
  const rows = await db.externalEvent.findMany({
    where: { start: { lt: to }, end: { gt: from } },
    orderBy: [{ start: "asc" }, { title: "asc" }],
    take: 2000,
    include: { calendar: { select: { source: { select: { kind: true } } } } },
  });
  return rows.map((e) => {
    const kind = e.calendar.source?.kind ?? "";
    return {
      id: e.id,
      calendarId: e.calendarId,
      kind,
      title: e.title,
      start: e.start.toISOString(),
      end: e.end.toISOString(),
      allDay: e.allDay,
      url: e.url,
      // Re-checked on the way out: what the page renders always matches the kind's schema.
      details: getSource(kind)?.parseDetails(e.details) ?? null,
    };
  });
}

/** The workspace's calendars with what the board needs to know about the source behind each. */
export async function listCalendarsWithSources(db: PrismaClient) {
  const calendars = await db.calendar.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { source: { select: { kind: true, lastSyncError: true } } },
  });
  return calendars.map(({ source, ...calendar }) => {
    const def = source ? getSource(source.kind) : null;
    const info: CalendarSourceInfo | null =
      source && def
        ? { kind: source.kind, attribution: def.attribution, failed: source.lastSyncError !== null }
        : null;
    return { ...calendar, source: info };
  });
}
