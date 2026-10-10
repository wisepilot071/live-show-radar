import { configuredSources } from "@/integrations/events/registry";
import type { EventSourceAdapter, SourceArtistRef } from "@/integrations/events/contract";
import { getSql } from "@/server/db";
import { withJobLock } from "@/server/guards";
import { errorMessage, log, type ErrorCategory } from "@/server/log";
import { normalizeRecord } from "./normalize";
import { upsertRecord } from "./upsert";

/**
 * Discovery run: followed artists → each configured source → validate →
 * normalise → dedup/upsert → per-source run record.
 *
 * - Incremental: per source, only artists not attempted in RECHECK_HOURS,
 *   oldest first, capped per run; a time budget stops early and the next
 *   run continues where this one stopped.
 * - Locked per scope so concurrent runs can't double-process.
 * - A failing source never blocks the others, and a failed run is recorded
 *   as failed — never as an empty success.
 */
const RECHECK_HOURS = 6;
const MAX_ARTISTS_PER_SOURCE = 15;
const TIME_BUDGET_MS = 40_000;

export interface SourceRunSummary {
  sourceId: string;
  sourceName: string;
  status: "succeeded" | "partial" | "failed" | "skipped";
  errorCategory?: ErrorCategory;
  artistsRequested: number;
  artistsChecked: number;
  recordsReturned: number;
  eventsNew: number;
  eventsUpdated: number;
  duplicateCandidates: number;
  recordsRejected: number;
}

export type DiscoveryRunResult =
  | { status: "completed"; sources: SourceRunSummary[]; artistsWithoutCoverage: number }
  | { status: "locked" }
  | { status: "no_sources" }
  | { status: "no_artists" };

async function loadArtists(scope: { userId?: string }): Promise<SourceArtistRef[]> {
  const sql = getSql();
  const rows = scope.userId
    ? await sql<{ id: string; name: string; aliases: string[]; musicbrainz_id: string | null }[]>`
        select a.id, a.name, a.aliases, a.musicbrainz_id from radar.artists a
        join radar.user_artists ua on ua.artist_id = a.id where ua.user_id = ${scope.userId}`
    : await sql<{ id: string; name: string; aliases: string[]; musicbrainz_id: string | null }[]>`
        select distinct a.id, a.name, a.aliases, a.musicbrainz_id from radar.artists a
        join radar.user_artists ua on ua.artist_id = a.id`;
  return rows.map((r) => ({ artistId: r.id, name: r.name, aliases: r.aliases, musicbrainzId: r.musicbrainz_id ?? undefined }));
}

async function dueArtists(source: EventSourceAdapter, artists: SourceArtistRef[], cap: number): Promise<SourceArtistRef[]> {
  const eligible = artists.filter((a) => source.canLookUp(a));
  if (eligible.length === 0) return [];
  const sql = getSql();
  const checks = await sql<{ artist_id: string; last_attempt_at: Date }[]>`
    select artist_id, last_attempt_at from radar.artist_source_checks
    where source_id = ${source.id} and artist_id = any(${eligible.map((a) => a.artistId)})`;
  const last = new Map(checks.map((c) => [c.artist_id, c.last_attempt_at.getTime()]));
  const cutoff = Date.now() - RECHECK_HOURS * 3_600_000;
  return eligible
    .filter((a) => (last.get(a.artistId) ?? 0) < cutoff)
    .sort((a, b) => (last.get(a.artistId) ?? 0) - (last.get(b.artistId) ?? 0))
    .slice(0, cap);
}

async function runSource(
  source: EventSourceAdapter,
  artists: SourceArtistRef[],
  trigger: "user" | "admin" | "schedule",
  userId: string | undefined,
  deadline: number,
): Promise<SourceRunSummary> {
  const sql = getSql();
  const summary: SourceRunSummary = {
    sourceId: source.id,
    sourceName: source.name,
    status: "succeeded",
    artistsRequested: artists.length,
    artistsChecked: 0,
    recordsReturned: 0,
    eventsNew: 0,
    eventsUpdated: 0,
    duplicateCandidates: 0,
    recordsRejected: 0,
  };
  const [run] = await sql<{ id: string }[]>`
    insert into radar.ingestion_runs (source_id, trigger, user_id, artists_requested)
    values (${source.id}, ${trigger}, ${userId ?? null}, ${artists.length}) returning id`;

  if (artists.length === 0) {
    summary.status = "skipped";
  } else {
    let outcome;
    try {
      outcome = await source.fetchForArtists(artists, { deadline });
    } catch (err) {
      log.error("discovery", "adapter threw", { source: source.id, error: errorMessage(err) });
      outcome = { ok: false as const, category: "internal" as const, message: "Unexpected adapter error" };
    }

    if (!outcome.ok) {
      summary.status = "failed";
      summary.errorCategory = outcome.category;
    } else {
      summary.artistsChecked = outcome.checkedArtistIds.length;
      summary.recordsReturned = outcome.records.length;
      for (const raw of outcome.records) {
        const norm = normalizeRecord(raw, source, artists);
        if (!norm.ok) {
          summary.recordsRejected++;
          log.warn("discovery", "record rejected", { source: source.id, reason: norm.reason });
          continue;
        }
        try {
          const res = await upsertRecord(sql, norm.record);
          if (res.outcome === "new") summary.eventsNew++;
          if (res.outcome === "updated") summary.eventsUpdated++;
          if (res.duplicateCandidate) summary.duplicateCandidates++;
        } catch (err) {
          summary.recordsRejected++;
          summary.errorCategory = "database_unavailable";
          log.error("discovery", "upsert failed", { source: source.id, error: errorMessage(err) });
        }
      }
      if (outcome.artistFailures.length > 0 || summary.errorCategory) summary.status = "partial";
      if (outcome.artistFailures.length > 0 && !summary.errorCategory) summary.errorCategory = outcome.artistFailures[0]!.category;

      // Record per-artist attempt/success for incremental scheduling.
      const failedIds = new Set(outcome.artistFailures.map((f) => f.artistId));
      for (const a of artists) {
        const succeeded = outcome.checkedArtistIds.includes(a.artistId);
        const failed = failedIds.has(a.artistId);
        if (!succeeded && !failed) continue; // not reached within the time budget
        await sql`
          insert into radar.artist_source_checks (artist_id, source_id, last_attempt_at, last_success_at, last_error_category)
          values (${a.artistId}, ${source.id}, now(), ${succeeded ? sql`now()` : null}, ${failed ? outcome.artistFailures.find((f) => f.artistId === a.artistId)!.category : null})
          on conflict (artist_id, source_id) do update set
            last_attempt_at = now(),
            last_success_at = coalesce(excluded.last_success_at, radar.artist_source_checks.last_success_at),
            last_error_category = excluded.last_error_category`;
      }
    }
  }

  await sql`
    update radar.ingestion_runs set
      finished_at = now(), status = ${summary.status}, error_category = ${summary.errorCategory ?? null},
      artists_checked = ${summary.artistsChecked}, records_returned = ${summary.recordsReturned},
      events_new = ${summary.eventsNew}, events_updated = ${summary.eventsUpdated},
      duplicate_candidates = ${summary.duplicateCandidates}, records_rejected = ${summary.recordsRejected}
    where id = ${run!.id}`;
  log.info("discovery", "source run finished", { ...summary });
  return summary;
}

export async function runDiscovery(opts: {
  trigger: "user" | "admin" | "schedule";
  userId?: string;
  /** Override the configured sources (tests use an isolated fixture adapter). */
  sources?: EventSourceAdapter[];
  /** Total time budget for this run (serverless duration limits). */
  timeBudgetMs?: number;
  /** Per-source cap on artists checked in one run. */
  maxArtistsPerSource?: number;
}): Promise<DiscoveryRunResult> {
  const sources = opts.sources ?? configuredSources();
  if (sources.length === 0) return { status: "no_sources" };
  const artists = await loadArtists({ userId: opts.userId });
  if (artists.length === 0) return { status: "no_artists" };

  const lockKey = opts.userId ? `discovery:user:${opts.userId}` : "discovery:all";
  const locked = await withJobLock(lockKey, 120, async () => {
    const deadline = Date.now() + (opts.timeBudgetMs ?? TIME_BUDGET_MS);
    const summaries: SourceRunSummary[] = [];
    for (const source of sources) {
      const due = await dueArtists(source, artists, opts.maxArtistsPerSource ?? MAX_ARTISTS_PER_SOURCE);
      summaries.push(await runSource(source, due, opts.trigger, opts.userId, deadline));
    }
    const coverable = new Set(artists.filter((a) => sources.some((s) => s.canLookUp(a))).map((a) => a.artistId));
    return { status: "completed" as const, sources: summaries, artistsWithoutCoverage: artists.length - coverable.size };
  });
  return locked.acquired ? locked.value : { status: "locked" };
}
