import type { Prisma, PrismaClient } from "@jakab/db";
import { notFound } from "../errors";
import { notifyBoardChanged } from "../notify";
import { getWorkspace } from "../workspace";
import { createSourceFetch, SourceHttpError } from "./http";
import { getSource } from "./registry";
import { decryptSecret, SecretUnreadable } from "./secret-box";
import { SourceError, type Source, type SourceErrorCode, type SourceEventInput } from "./types";

const HOUR = 60 * 60 * 1000;
/** Taken off the next due time so the hourly check never lands a moment too early and skips a day. */
const SCHEDULE_SLACK_MS = 10 * 60 * 1000;
/** After a failure that may pass by itself, try again in a few hours (one daily request budget). */
const RETRY_AFTER_ERROR_MS = 6 * HOUR;
/** Saved events older than this are dropped; the provider only looks 31 days back, so we keep the past. */
const KEEP_MONTHS = 12;
/** One run may not take longer than this, whatever the provider does. */
const RUN_TIMEOUT_MS = 90_000;
const TITLE_MAX = 300;
const URL_MAX = 2000;

export interface SyncDeps {
  /** The network function (replaced in tests). */
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export type SyncOutcome = "ok" | "error" | "busy";

/** Sources being updated right now: a scheduled run and "Update now" never overlap. */
const running = new Set<string>();

/**
 * Updates one source: asks the provider, then in one transaction adds or updates the events by
 * their `externalId`, removes what the source reports as gone and records the outcome. A failed run
 * writes its error and leaves the saved events alone: a calendar is never emptied by a network error.
 */
export async function syncSource(
  db: PrismaClient,
  id: string,
  deps: SyncDeps = {},
): Promise<{ outcome: SyncOutcome }> {
  if (running.has(id)) return { outcome: "busy" };
  running.add(id);
  try {
    return await run(db, id, deps);
  } finally {
    running.delete(id);
  }
}

/** Updates every enabled source whose time has come; one failing never stops the others. */
export async function syncDueSources(db: PrismaClient, deps: SyncDeps = {}) {
  const now = (deps.now ?? (() => new Date()))();
  const due = await db.calendarSource.findMany({
    where: { enabled: true, nextSyncAt: { lte: now } },
    select: { id: true },
    orderBy: { nextSyncAt: "asc" },
  });
  let synced = 0;
  for (const { id } of due) {
    try {
      const { outcome } = await syncSource(db, id, deps);
      if (outcome !== "busy") synced++;
    } catch (error) {
      console.error(`source ${id}: sync crashed`, error);
    }
  }
  return { due: due.length, synced };
}

async function run(
  db: PrismaClient,
  id: string,
  deps: SyncDeps,
): Promise<{ outcome: SyncOutcome }> {
  const now = (deps.now ?? (() => new Date()))();
  const row = await db.calendarSource.findUnique({ where: { id } });
  if (!row) throw notFound("Source");
  const def = getSource(row.kind);
  if (!def) {
    await recordFailure(db, row, null, now, "unknown", "This kind of source is not available", {});
    return { outcome: "error" };
  }

  /** Every secret value, so none of them can end up in a stored message. */
  let secrets: string[] = [];
  let credentials: unknown = {};
  try {
    if (def.needsCredentials) {
      if (!row.secret) throw new SecretUnreadable();
      const plain = decryptSecret(row.secret);
      credentials = def.parseCredentials(JSON.parse(plain));
      secrets = Object.values(credentials as Record<string, unknown>).filter(
        (v): v is string => typeof v === "string" && v.length >= 4,
      );
    }
  } catch {
    // Damaged, or encrypted under another AUTH_SECRET: the key has to be entered again.
    await recordFailure(
      db,
      row,
      def,
      now,
      "key_unreadable",
      "The stored key cannot be read: enter it again",
      {},
    );
    return { outcome: "error" };
  }

  const timeZone = (await getWorkspace(db)).timeZone;
  const existing = await db.externalEvent.findMany({
    where: { calendarId: row.calendarId, start: { gte: new Date(now.getTime() - 36 * HOUR) } },
    select: { externalId: true, start: true, details: true },
  });
  const signal = AbortSignal.timeout(RUN_TIMEOUT_MS);
  const ctx = {
    fetch: createSourceFetch(def.hosts, { impl: deps.fetchImpl, signal }),
    now,
    timeZone,
    signal,
  };

  try {
    const result = await def.sync(
      { credentials, config: row.config, state: row.state, existing },
      ctx,
    );
    const events = cleanEvents(def, result.events);
    await db.$transaction(
      async (tx) => {
        await saveEvents(tx, row.calendarId, events);
        if (result.removeExternalIds?.length) {
          await tx.externalEvent.deleteMany({
            where: { calendarId: row.calendarId, externalId: { in: result.removeExternalIds } },
          });
        }
        const cutoff = new Date(now);
        cutoff.setUTCMonth(cutoff.getUTCMonth() - KEEP_MONTHS);
        await tx.externalEvent.deleteMany({
          where: { calendarId: row.calendarId, end: { lt: cutoff } },
        });
        await tx.calendarSource.update({
          where: { id },
          data: {
            state: result.state as Prisma.InputJsonValue,
            lastSyncAt: now,
            lastSyncError: null,
            lastSyncErrorCode: null,
            nextSyncAt: new Date(now.getTime() + def.intervalHours * HOUR - SCHEDULE_SLACK_MS),
          },
        });
        await notifyBoardChanged(tx, "source", id);
      },
      { timeout: 30_000 },
    );
    return { outcome: "ok" };
  } catch (error) {
    const failure = describeFailure(error, secrets);
    await recordFailure(db, row, def, now, failure.code, failure.message, {
      state: failure.state,
      retryAt: failure.retryAt,
    });
    return { outcome: "error" };
  }
}

/** Keeps only what is safe and sensible to store: bounded text, http(s) links, valid details. */
function cleanEvents(def: Source, events: SourceEventInput[]) {
  const byId = new Map<string, SourceEventInput>();
  for (const e of events) {
    const title = e.title.trim().slice(0, TITLE_MAX);
    if (!title || !e.externalId || e.end < e.start) continue;
    byId.set(e.externalId.slice(0, 200), {
      ...e,
      externalId: e.externalId.slice(0, 200),
      title,
      url: safeUrl(e.url),
      details: e.details === undefined ? null : def.parseDetails(e.details),
    });
  }
  return [...byId.values()];
}

function safeUrl(value: string | null | undefined) {
  if (!value || value.length > URL_MAX) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function saveEvents(
  tx: Prisma.TransactionClient,
  calendarId: string,
  events: SourceEventInput[],
) {
  if (events.length === 0) return;
  const known = new Map(
    (
      await tx.externalEvent.findMany({
        where: { calendarId, externalId: { in: events.map((e) => e.externalId) } },
      })
    ).map((e) => [e.externalId, e]),
  );
  const fresh: Prisma.ExternalEventCreateManyInput[] = [];
  for (const e of events) {
    const data = {
      title: e.title,
      start: e.start,
      end: e.end,
      allDay: e.allDay,
      url: e.url ?? null,
      details: (e.details ?? null) as Prisma.InputJsonValue | null,
    };
    const old = known.get(e.externalId);
    if (!old) {
      fresh.push({
        calendarId,
        externalId: e.externalId,
        ...data,
        details: data.details ?? undefined,
      });
    } else if (
      old.title !== data.title ||
      old.start.getTime() !== data.start.getTime() ||
      old.end.getTime() !== data.end.getTime() ||
      old.allDay !== data.allDay ||
      old.url !== data.url ||
      JSON.stringify(old.details ?? null) !== JSON.stringify(data.details)
    ) {
      await tx.externalEvent.update({
        where: { id: old.id },
        data: { ...data, details: data.details ?? undefined },
      });
    }
  }
  if (fresh.length > 0) await tx.externalEvent.createMany({ data: fresh });
}

function describeFailure(error: unknown, secrets: string[]) {
  const redact = (text: string) => secrets.reduce((t, secret) => t.split(secret).join("***"), text);
  if (error instanceof SourceError) {
    return {
      code: error.code,
      message: redact(error.message).slice(0, 300),
      state: error.options.state,
      retryAt: error.options.retryAt,
    };
  }
  if (error instanceof SourceHttpError) {
    return { code: "unavailable" as const, message: redact(error.message).slice(0, 300) };
  }
  // Anything else is a bug: log it for the operator, show nothing of it (it could hold the key).
  console.error("source sync failed", error);
  return { code: "unknown" as const, message: "Unexpected error while updating this source" };
}

async function recordFailure(
  db: PrismaClient,
  row: { id: string; state: unknown },
  def: Source | null,
  now: Date,
  code: SourceErrorCode,
  message: string,
  extra: { state?: unknown; retryAt?: Date },
) {
  // A rejected key will not work tomorrow either: wait for a new one instead of spending requests.
  const nextSyncAt =
    code === "key_rejected" || code === "key_unreadable"
      ? null
      : (extra.retryAt ?? new Date(now.getTime() + RETRY_AFTER_ERROR_MS));
  const state = extra.state !== undefined && def ? def.parseState(extra.state) : undefined;
  try {
    await db.calendarSource.update({
      where: { id: row.id },
      data: {
        lastSyncError: message,
        lastSyncErrorCode: code,
        nextSyncAt,
        ...(state !== undefined && { state: state as Prisma.InputJsonValue }),
      },
    });
    await notifyBoardChanged(db, "source", row.id);
  } catch (error) {
    // Disconnected while it was running: nothing is left to record the failure on.
    if ((error as { code?: string }).code !== "P2025") throw error;
  }
}
