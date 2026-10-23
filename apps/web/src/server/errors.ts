export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Sent along as `code` so the client can tell this error apart from others with its status. */
    public code?: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);
export const conflict = (message: string) => new HttpError(409, message);
/**
 * No status exists yet, so no card or project can be created until an admin adds one in the
 * settings. The client recognises it by its code with `isNoStatusesError` in `lib/api.ts`.
 */
export const noStatuses = () =>
  new HttpError(
    422,
    "No status exists yet: an admin must create one in the settings",
    "no_statuses",
  );
export const badRequest = (message: string) => new HttpError(400, message);

/** 429: the user did too many expensive requests; `retryAfterSeconds` goes into `Retry-After`. */
export class TooManyRequests extends HttpError {
  constructor(public retryAfterSeconds: number) {
    super(429, "Too many requests, try again later");
  }
}
