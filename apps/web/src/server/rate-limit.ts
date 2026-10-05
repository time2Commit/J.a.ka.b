/** Fixed-window counter per key: simple, in memory, enough for a single web process. */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /** Counts one call for `key`. `retryAfterMs` is how long until the window resets when refused. */
  hit(key: string, now = Date.now()): { allowed: boolean; retryAfterMs: number } {
    if (this.windows.size > 10_000) this.sweep(now);
    const current = this.windows.get(key);
    if (!current || now - current.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return { allowed: true, retryAfterMs: 0 };
    }
    current.count++;
    if (current.count > this.limit) {
      return { allowed: false, retryAfterMs: current.start + this.windowMs - now };
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  private sweep(now: number) {
    for (const [key, w] of this.windows)
      if (now - w.start >= this.windowMs) this.windows.delete(key);
  }
}

export interface RateLimitRule {
  /** Name of the bucket: routes sharing a name share the allowance. */
  name: string;
  limit: number;
  windowMs: number;
}

const limiters = new Map<string, RateLimiter>();

/** The limiter for a rule (created on first use). */
export function limiterFor(rule: RateLimitRule): RateLimiter {
  let limiter = limiters.get(rule.name);
  if (!limiter) {
    limiter = new RateLimiter(rule.limit, rule.windowMs);
    limiters.set(rule.name, limiter);
  }
  return limiter;
}

const MINUTE = 60_000;

/** Limits for the routes that are expensive or write files, per signed-in user. */
export const LIMITS = {
  upload: { name: "upload", limit: 120, windowMs: MINUTE },
  export: { name: "export", limit: 20, windowMs: 10 * MINUTE },
  import: { name: "import", limit: 6, windowMs: 10 * MINUTE },
  backup: { name: "backup", limit: 6, windowMs: 10 * MINUTE },
} satisfies Record<string, RateLimitRule>;
