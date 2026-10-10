import { randomUUID } from "node:crypto";
import { getSql } from "./db";

/**
 * Fixed-window rate limit stored in Postgres, so it holds across every
 * serverless instance. Returns whether the call is allowed and when to retry.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const sql = getSql();
  const [row] = await sql<{ count: number; window_start: Date }[]>`
    insert into radar.rate_limits (key, window_start, count) values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when radar.rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then 1 else radar.rate_limits.count + 1 end,
      window_start = case when radar.rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
                   then now() else radar.rate_limits.window_start end
    returning count, window_start`;
  if (!row || row.count <= limit) return { allowed: true };
  const resetAt = row.window_start.getTime() + windowSeconds * 1000;
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) };
}

/**
 * Lease-based job lock: prevents two discovery runs for the same scope at
 * once (double-clicks, overlapping cron). Expired leases are taken over,
 * so a crashed run can't block forever.
 */
export async function withJobLock<T>(
  key: string,
  leaseSeconds: number,
  fn: () => Promise<T>,
): Promise<{ acquired: true; value: T } | { acquired: false }> {
  const sql = getSql();
  const holder = randomUUID();
  const got = await sql`
    insert into radar.job_locks (key, holder, expires_at)
    values (${key}, ${holder}, now() + make_interval(secs => ${leaseSeconds}))
    on conflict (key) do update set holder = excluded.holder, expires_at = excluded.expires_at
      where radar.job_locks.expires_at < now()
    returning holder`;
  if (got.length === 0) return { acquired: false };
  try {
    return { acquired: true, value: await fn() };
  } finally {
    await sql`delete from radar.job_locks where key = ${key} and holder = ${holder}`;
  }
}
