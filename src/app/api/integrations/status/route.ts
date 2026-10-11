import { NextResponse } from "next/server";
import { EVENT_SOURCES } from "@/integrations/events/registry";
import { geminiStatus } from "@/integrations/gemini/client";
import { getSpotifyAvailability } from "@/integrations/spotify/server";
import type { IntegrationStatusReport } from "@/integrations/status";
import { getSql, isDatabaseConfigured, pingDatabase } from "@/server/db";
import { log, errorMessage } from "@/server/log";
import { emailChannelStatus } from "@/server/notifications/channels";
import { telegramStatus } from "@/server/notifications/telegram";
import { googleCalendarStatus } from "@/server/google-calendar";
import { isSessionConfigured } from "@/server/session";
import { getServerEnv } from "@/config/server-env";
import { getActiveArtistSearch } from "@/services/artist-search/active";

/** Reports what is actually wired up — and what has actually worked. No secrets. */
export async function GET() {
  const search = getActiveArtistSearch();
  const db = await pingDatabase();
  const serverPersistence = db.ok && isSessionConfigured();

  let runs: Array<{ source_id: string; status: string; finished_at: Date | null; error_category: string | null; last_ok: Date | null }> = [];
  let ai: { last_ok: Date | null; last_fail: Date | null } = { last_ok: null, last_fail: null };
  let job: { started_at: Date; status: string; trigger: string } | undefined;
  let jobOk: Date | null = null;
  if (db.ok) {
    try {
      const sql = getSql();
      runs = await sql`
        select distinct on (source_id) source_id, status, finished_at, error_category,
          (select max(finished_at) from radar.ingestion_runs r2 where r2.source_id = r.source_id and r2.status in ('succeeded', 'partial')) as last_ok
        from radar.ingestion_runs r where finished_at is not null
        order by source_id, finished_at desc`;
      const [row] = await sql<{ last_ok: Date | null; last_fail: Date | null }[]>`
        select max(created_at) filter (where status = 'ok') as last_ok,
               max(created_at) filter (where status <> 'ok') as last_fail
        from radar.ai_extractions`;
      if (row) ai = row;
      [job] = await sql<{ started_at: Date; status: string; trigger: string }[]>`
        select started_at, status, trigger from radar.job_runs where job = 'monitoring' order by started_at desc limit 1`;
      const [okRow] = await sql<{ at: Date | null }[]>`
        select max(started_at) as at from radar.job_runs where job = 'monitoring' and status in ('succeeded', 'partial')`;
      jobOk = okRow?.at ?? null;
    } catch (err) {
      log.warn("status", "couldn't read run history", { error: errorMessage(err) });
    }
  }

  const gem = geminiStatus();
  const email = emailChannelStatus();
  const report: IntegrationStatusReport = {
    checkedAt: new Date().toISOString(),
    spotify: getSpotifyAvailability(),
    artistSearch: { source: search.sourceId, label: search.label },
    database: { configured: isDatabaseConfigured(), reachable: isDatabaseConfigured() ? db.ok : null },
    persistence: serverPersistence
      ? { kind: "server", label: "Saved to your profile on the server" }
      : { kind: "browser_draft", label: "Saved in this browser only" },
    eventSources: {
      connected: EVENT_SOURCES.filter((s) => s.configStatus().configured).map((s) => ({ id: s.id, name: s.name })),
      all: EVENT_SOURCES.map((s) => {
        const cfg = s.configStatus();
        const run = runs.find((r) => r.source_id === s.id);
        return {
          id: s.id,
          name: s.name,
          configured: cfg.configured,
          reason: cfg.reason,
          lastRun: run?.finished_at ? { status: run.status, at: run.finished_at.toISOString(), errorCategory: run.error_category ?? undefined } : undefined,
          lastSuccessAt: run?.last_ok?.toISOString(),
        };
      }),
    },
    gemini: {
      configured: gem.configured,
      model: gem.model,
      fallbackModel: gem.fallbackModel,
      lastSuccessAt: ai.last_ok?.toISOString(),
      lastFailureAt: ai.last_fail?.toISOString(),
    },
    notifications: {
      // The inbox is implemented and works whenever server storage does.
      in_app: serverPersistence ? "active" : "not_available",
      // Email needs a user address on top of server config, hence "setup_required".
      email: email.configured && serverPersistence ? "setup_required" : "not_available",
      // Telegram needs the user to link a chat on top of the bot config.
      telegram: telegramStatus().configured && serverPersistence ? "setup_required" : "not_available",
    },
    emailReason: email.configured ? null : (email.reason ?? "not configured"),
    telegramReason: telegramStatus().configured ? null : (telegramStatus().reason ?? "not configured"),
    googleCalendar: { configured: googleCalendarStatus().configured, reason: googleCalendarStatus().reason ?? null },
    // "Beescraper" was requested; the key provided is ScrapingBee, integrated as news-announcement discovery above.
    unavailableSources: [],
    scheduler: {
      configured: Boolean(getServerEnv().cronSecret),
      cadence: "Daily at 07:00 IST (Vercel Hobby cron: at most once a day, timing within the hour)",
      lastRun: job ? { at: job.started_at.toISOString(), status: job.status, trigger: job.trigger } : undefined,
      lastSuccessAt: jobOk?.toISOString(),
    },
  };
  return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
}
