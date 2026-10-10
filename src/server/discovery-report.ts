import type { DiscoveryReport, SourceCheck } from "@/domain/types";
import { EVENT_SOURCES } from "@/integrations/events/registry";
import { getSql } from "./db";
import { listUserEvents, type EventFilters } from "./repos/events";

/**
 * Builds the dashboard's discovery report for one user from what actually
 * happened: per-source, per-artist check records. It distinguishes
 * not configured / never checked / failed / checked-and-empty — a failed
 * source is never reported as "no events".
 */
export async function buildDiscoveryReport(userId: string, filters: EventFilters = {}): Promise<DiscoveryReport> {
  const sql = getSql();
  const generatedAt = new Date().toISOString();
  const artists = await sql<{ id: string; name: string; musicbrainz_id: string | null; aliases: string[] }[]>`
    select a.id, a.name, a.musicbrainz_id, a.aliases from radar.artists a
    join radar.user_artists ua on ua.artist_id = a.id where ua.user_id = ${userId}`;
  const checks = artists.length
    ? await sql<{ source_id: string; last_attempt_at: Date; last_success_at: Date | null; last_error_category: string | null }[]>`
        select source_id, last_attempt_at, last_success_at, last_error_category
        from radar.artist_source_checks where artist_id = any(${artists.map((a) => a.id)})`
    : [];

  const configured = EVENT_SOURCES.filter((s) => s.configStatus().configured);
  const refs = artists.map((a) => ({ artistId: a.id, name: a.name, aliases: a.aliases, musicbrainzId: a.musicbrainz_id ?? undefined }));
  const uncovered = refs.filter((a) => !configured.some((s) => s.canLookUp(a)));

  const sources: SourceCheck[] = EVENT_SOURCES.map((s) => {
    if (!s.configStatus().configured) {
      return { sourceId: s.id, sourceName: s.name, outcome: "not_configured", checkedAt: generatedAt, message: s.configStatus().reason };
    }
    const mine = checks.filter((c) => c.source_id === s.id);
    if (mine.length === 0) return { sourceId: s.id, sourceName: s.name, outcome: "never_run", checkedAt: generatedAt };
    const latest = mine.reduce((a, b) => (b.last_attempt_at > a.last_attempt_at ? b : a));
    const failed = latest.last_error_category !== null && (!latest.last_success_at || latest.last_success_at < latest.last_attempt_at);
    return {
      sourceId: s.id,
      sourceName: s.name,
      outcome: failed ? "failed" : "ok",
      checkedAt: latest.last_attempt_at.toISOString(),
      message: failed ? `${s.name} couldn't be checked (${latest.last_error_category?.replace(/_/g, " ")}).` : undefined,
    };
  });

  const active = sources.filter((s) => s.outcome !== "not_configured");
  const ran = active.filter((s) => s.outcome === "ok" || s.outcome === "failed");
  const okCount = ran.filter((s) => s.outcome === "ok").length;
  const successes = checks.map((c) => c.last_success_at).filter((d): d is Date => d !== null);
  const lastSuccessfulCheckAt = successes.length ? new Date(Math.max(...successes.map((d) => d.getTime()))).toISOString() : undefined;

  const status: DiscoveryReport["status"] =
    configured.length === 0
      ? "not_connected"
      : ran.length === 0
        ? "never_checked"
        : okCount === 0
          ? "error"
          : okCount < ran.length
            ? "partial"
            : "ok";

  return {
    status,
    generatedAt,
    lastSuccessfulCheckAt,
    sources,
    events: artists.length ? await listUserEvents(userId, filters) : [],
    coverage: { covered: refs.length - uncovered.length, uncovered: uncovered.length, uncoveredNames: uncovered.slice(0, 12).map((a) => a.name) },
  };
}
