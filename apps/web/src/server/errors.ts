export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);
export const conflict = (message: string) => new HttpError(409, message);
/**
 * 422: no status exists yet, so no card or project can be created until an admin adds one in the
 * settings. The client recognises it with `isNoStatusesError` in `lib/api.ts`.
 */
export const noStatuses = () =>
  new HttpError(422, "No status exists yet: create one in the settings first");
export const badRequest = (message: string) => new HttpError(400, message);

/** 429: the user did too many expensive requests; `retryAfterSeconds` goes into `Retry-After`. */
export class TooManyRequests extends HttpError {
  constructor(public retryAfterSeconds: number) {
    super(429, "Too many requests, try again later");
  }
}
