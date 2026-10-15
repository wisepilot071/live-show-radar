import { timingSafeEqual } from "node:crypto";
import { getSql } from "./db";
import { withJobLock } from "./guards";
import { runDiscovery, type DiscoveryRunResult } from "./ingest/pipeline";
import { errorMessage, log, type ErrorCategory } from "./log";
import { runNotificationPipeline, type NotificationSummary } from "./notifications/process";
import { findMissingTicketLinks, type TicketLinkSummary } from "./ticket-links";

/**
 * The monitoring job — what Vercel Cron runs daily (and operators can run
 * on demand): discovery for all followed artists → change processing →
 * deadline reminders → delivery. Recorded in radar.job_runs; locked so two
 * runs can never overlap; every step is idempotent so a crashed or repeated
 * run is safe to retry.
 */
export const MONITOR_TIME_BUDGET_MS = 180_000; // inside Vercel Hobby's 300s function limit
export const MONITOR_ARTISTS_PER_SOURCE = 60;

export interface MonitoringResult {
  status: "succeeded" | "partial" | "failed" | "locked";
  runId?: string;
  discovery?: DiscoveryRunResult;
  notifications?: NotificationSummary | "locked";
  ticketLinks?: TicketLinkSummary;
  errorCategory?: ErrorCategory;
}

export async function runMonitoringJob(trigger: "schedule" | "admin"): Promise<MonitoringResult> {
  const sql = getSql();
  const locked = await withJobLock("monitoring", 290, async (): Promise<MonitoringResult> => {
    const [run] = await sql<{ id: string }[]>`insert into radar.job_runs (job, trigger) values ('monitoring', ${trigger}) returning id`;
    const runId = run!.id;
    let status: MonitoringResult["status"] = "succeeded";
    let discovery: DiscoveryRunResult | undefined;
    let notifications: NotificationSummary | "locked" | undefined;
    let ticketLinks: TicketLinkSummary | undefined;
    const startedAt = Date.now();
    let errorCategory: ErrorCategory | undefined;
    try {
      discovery = await runDiscovery({
        trigger,
        timeBudgetMs: MONITOR_TIME_BUDGET_MS,
        maxArtistsPerSource: MONITOR_ARTISTS_PER_SOURCE,
      });
      if (discovery.status === "completed" && discovery.sources.some((s) => s.status === "failed" || s.status === "partial")) {
        status = "partial";
        errorCategory = discovery.sources.find((s) => s.errorCategory)?.errorCategory;
      }
      const notif = await runNotificationPipeline();
      notifications = notif.acquired ? notif.value : "locked";
      if (notif.acquired && notif.value.deliveriesFailed > 0) status = "partial";
      // Last, with whatever time is left: ticket pages for shows whose source gave no link.
      try {
        ticketLinks = await findMissingTicketLinks({ deadline: startedAt + 270_000 });
      } catch (err) {
        log.warn("monitoring", "ticket-link search failed", { error: errorMessage(err) });
      }
    } catch (err) {
      status = "failed";
      errorCategory = /connect|ECONN|terminat/i.test(errorMessage(err)) ? "database_unavailable" : "internal";
      log.error("monitoring", "job failed", { error: errorMessage(err), category: errorCategory });
    }
    await sql`
      update radar.job_runs set finished_at = now(), status = ${status}, error_category = ${errorCategory ?? null},
        summary = ${sql.json({ discovery, notifications, ticketLinks } as never)}
      where id = ${runId}`;
    return { status, runId, discovery, notifications, ticketLinks, errorCategory };
  });
  if (!locked.acquired) {
    await sql`insert into radar.job_runs (job, trigger, status, finished_at) values ('monitoring', ${trigger}, 'locked', now())`;
    return { status: "locked" };
  }
  return locked.value;
}

/** Constant-time bearer token check. A missing configured secret always fails closed. */
export function bearerMatches(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const given = Buffer.from((header ?? "").replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
