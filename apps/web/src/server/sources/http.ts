import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { sizeLimiter } from "../stream-limit";

/** A call to a provider failed before an answer could be used: network, time, size, redirect... */
export class SourceHttpError extends Error {}

export interface SourceResponse {
  status: number;
  /** The parsed JSON body, or null when the provider sent none (or not JSON). */
  body: unknown;
}

export interface SourceRequest {
  /** Sent as HTTP headers; where credentials go, never in the URL. */
  headers?: Record<string, string>;
}

/** Fetches a URL on behalf of a source. Everything a source sends to the internet goes through it. */
export type SourceFetch = (url: string, request?: SourceRequest) => Promise<SourceResponse>;

export const SOURCE_HTTP_LIMITS = { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024 };

/**
 * The only door from the server to a provider. `https` only, only to the hosts the source declared,
 * no redirect followed (a provider has no business sending us elsewhere), 10 seconds at most and a
 * 2 MB answer at most. `impl` is replaced in tests so they never touch the internet.
 */
export function createSourceFetch(
  hosts: readonly string[],
  options: {
    impl?: typeof fetch;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): SourceFetch {
  const impl = options.impl ?? fetch;
  const timeoutMs = options.timeoutMs ?? SOURCE_HTTP_LIMITS.timeoutMs;
  const maxBytes = options.maxBytes ?? SOURCE_HTTP_LIMITS.maxBytes;
  const allowed = new Set(hosts.map((h) => h.toLowerCase()));

  return async (rawUrl, request = {}) => {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new SourceHttpError("Invalid URL");
    }
    if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) {
      throw new SourceHttpError("Only plain https addresses are allowed");
    }
    if (!allowed.has(url.hostname.toLowerCase())) {
      throw new SourceHttpError("Host not allowed for this source");
    }

    const signals = [AbortSignal.timeout(timeoutMs)];
    if (options.signal) signals.push(options.signal);
    const signal = AbortSignal.any(signals);

    let response: Response;
    try {
      response = await impl(url, {
        method: "GET",
        headers: { Accept: "application/json", ...request.headers },
        redirect: "manual",
        credentials: "omit",
        signal,
      });
    } catch (error) {
      throw new SourceHttpError(
        signal.aborted
          ? "The provider did not answer in time"
          : "The provider could not be reached",
        { cause: error },
      );
    }
    if (response.status >= 300 && response.status < 400) {
      throw new SourceHttpError("The provider answered with a redirect, which is not followed");
    }
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      void response.body?.cancel().catch(() => {});
      throw new SourceHttpError("The provider's answer is too large");
    }

    const chunks: Buffer[] = [];
    if (response.body) {
      const limit = sizeLimiter(
        maxBytes,
        () => new SourceHttpError("The provider's answer is too large"),
      );
      try {
        await pipeline(
          Readable.fromWeb(response.body as unknown as WebReadableStream),
          limit.stream,
          new Writable({
            write(chunk: Buffer, _encoding, callback) {
              chunks.push(chunk);
              callback();
            },
          }),
          { signal },
        );
      } catch (error) {
        if (error instanceof SourceHttpError) throw error;
        throw new SourceHttpError(
          signal.aborted
            ? "The provider did not answer in time"
            : "The provider's answer was cut off",
          { cause: error },
        );
      }
    }
    let body: unknown = null;
    try {
      const text = Buffer.concat(chunks).toString("utf8");
      if (text) body = JSON.parse(text);
    } catch {
      body = null;
    }
    return { status: response.status, body };
  };
}
