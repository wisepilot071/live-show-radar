import { getServerEnv } from "@/config/server-env";
import { getSql } from "@/server/db";
import { fail, handle, ok } from "@/server/http";
import { bearerMatches } from "@/server/monitoring";

/**
 * Operator status (Bearer DISCOVERY_ADMIN_TOKEN). Aggregates only: no user
 * identifiers, email addresses, or provider payloads.
 */
export const GET = handle("api/admin/status", async (req: Request) => {
  const token = getServerEnv().discoveryAdminToken;
  if (!token) return fail(503, "not_configured", "Admin status is disabled (DISCOVERY_ADMIN_TOKEN not set).");
  if (!bearerMatches(req.headers.get("authorization"), token)) return fail(401, "unauthorized", "Not authorised.");
  const sql = getSql();
  const recentRuns = await sql`
    select id, trigger, status, error_category, started_at, finished_at, summary
    from radar.job_runs where job = 'monitoring' order by started_at desc limit 10`;
  const [lastScheduledRun] = await sql`
    select started_at, finished_at, status from radar.job_runs
    where job = 'monitoring' and trigger = 'schedule' order by started_at desc limit 1`;
  const [lastSuccessfulRun] = await sql`
    select started_at from radar.job_runs
    where job = 'monitoring' and status in ('succeeded', 'partial') order by started_at desc limit 1`;
  const [running] = await sql`select count(*)::int as count from radar.job_runs where job = 'monitoring' and status = 'running'`;
  const sources = await sql`
    select distinct on (source_id) source_id, status, error_category, finished_at, artists_checked, records_returned,
      events_new, events_updated, duplicate_candidates, records_rejected
    from radar.ingestion_runs where finished_at is not null order by source_id, finished_at desc`;
  const deliveries = await sql`
    select channel, status, count(*)::int as count from radar.notification_deliveries group by 1, 2 order by 1, 2`;
  const [notifications] = await sql`
    select count(*)::int as total, count(*) filter (where created_at > now() - interval '1 day')::int as last_24h
    from radar.notifications`;
  const [changeCursor] = await sql`select last_change_id::text as last_change_id, updated_at from radar.job_cursors where job = 'notifications'`;
  return ok({
    lastScheduledRun: lastScheduledRun ?? null,
    lastSuccessfulRun: lastSuccessfulRun ?? null,
    runningNow: running?.count ?? 0,
    recentRuns,
    sources,
    deliveries,
    notifications,
    changeCursor: changeCursor ?? null,
  });
});
