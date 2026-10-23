export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The server's machine-readable `code`, when it sends one. */
    public code?: string,
  ) {
    super(message);
  }
}

/** The server refused to create a card or project because no status exists yet (see `noStatuses`). */
export const isNoStatusesError = (error: unknown) =>
  error instanceof ApiError && error.code === "no_statuses";

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: { ...(json !== undefined && { "Content-Type": "application/json" }), ...rest.headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const { error, code } = data as { error?: string; code?: string };
    throw new ApiError(res.status, error ?? res.statusText, code);
  }
  return data as T;
}
