import { verificationFor, SOURCE_STRENGTH, type SourceClass } from "@/domain/freshness";
import { effectiveTicketKind } from "@/domain/ticket-timeline";
import type { EventSourceEvidence, LiveEvent, TicketStatusKind, VerificationState } from "@/domain/types";
import { getSql } from "@/server/db";
import type { CanonicalFields } from "@/server/ingest/normalize";
import { safeTicketUrl } from "@/lib/ticket-url";

/**
 * Read side: canonical events → the LiveEvent contract the UI already uses.
 * Verification is computed at READ time from each source's class and last
 * successful check (src/domain/freshness.ts), so staleness is always current
 * and never frozen into the database.
 */

interface EventRow {
  id: string;
  title: string;
  kind: LiveEvent["kind"];
  starts_at: Date | null;
  local_date: Date | null;
  time_zone: string;
  venue_name: string | null;
  city_name: string | null;
  city_id: string | null;
  country_code: string | null;
  location_confidence: NonNullable<LiveEvent["locationConfidence"]>;
  ticket_url: string | null;
  ticket_status: string;
  sale_opens_at: Date | null;
  early_bird_ends_at: Date | null;
  image_url: string | null;
  price_min: string | null;
  price_max: string | null;
  price_currency: string | null;
  event_status: "scheduled" | "cancelled" | "rescheduled" | "unknown";
  announced_at: Date | null;
  needs_review: boolean;
  artist_keys: string[];
  artist_names: string[];
}

interface SourceRow {
  event_id: string;
  source_id: string;
  source_name: string;
  source_url: string | null;
  first_seen_at: Date;
  last_checked_at: Date;
  last_success_at: Date | null;
  record: { fields: CanonicalFields; sourceClass: SourceClass };
}

const iso = (d: Date | null) => (d ? d.toISOString() : undefined);

function mapEvent(e: EventRow, sources: SourceRow[], now: Date): LiveEvent {
  const ordered = [...sources].sort(
    (a, b) => SOURCE_STRENGTH[b.record.sourceClass] - SOURCE_STRENGTH[a.record.sourceClass],
  );
  const primary = ordered[0];

  // Event details: the best state any source currently supports.
  const rank: Record<VerificationState, number> = { confirmed: 4, stale: 3, unconfirmed: 2, pending: 1, unavailable: 0 };
  const evidence: EventSourceEvidence[] = ordered.map((s) => ({
    sourceId: publicSourceId(s.source_id),
    sourceName: publicSourceName(s.source_id, s.source_name, s.source_url),
    url: s.source_url ?? undefined,
    firstSeenAt: s.first_seen_at.toISOString(),
    lastCheckedAt: s.last_checked_at.toISOString(),
    lastSuccessAt: iso(s.last_success_at),
    verification: verificationFor(s.record.sourceClass, "event_details", s.last_success_at, now, { sourceProvidesFact: true }),
  }));
  let details = evidence.reduce<VerificationState>((best, s) => (rank[s.verification] > rank[best] ? s.verification : best), "unavailable");
  const notes: string[] = [];
  if (e.location_confidence === "coordinates") {
    notes.push("City inferred from venue coordinates — check the venue.");
    if (details === "confirmed") details = "unconfirmed";
  }
  if (e.needs_review) notes.push("Another listing may describe this same show; we haven't merged them.");

  // Tickets: only sources that expose availability can verify it.
  const ticketSources = ordered.filter((s) => s.record.fields.ticketExposed);
  const ticketVerification: VerificationState = ticketSources.length
    ? ticketSources
        .map((s) => verificationFor(s.record.sourceClass, "ticket_availability", s.last_success_at, now, { sourceProvidesFact: true }))
        .reduce((best, v) => (rank[v] > rank[best] ? v : best), "unavailable" as VerificationState)
    : "unavailable";
  // Only sources that can verify a fact may report a "last verified" time; a pasted announcement can't.
  const canVerify = (s: SourceRow) => s.record.sourceClass !== "user_submitted";
  const bestTicketCheck = ticketSources
    .filter(canVerify)
    .map((s) => s.last_success_at)
    .filter(Boolean)
    .sort((a, b) => b!.getTime() - a!.getTime())[0];
  const verifyingPrimary = ordered.find(canVerify);

  const kind: TicketStatusKind =
    e.event_status === "cancelled"
      ? "cancelled"
      : e.event_status === "rescheduled"
        ? "postponed"
        : effectiveTicketKind(e.ticket_status as TicketStatusKind, { saleOpensAt: e.sale_opens_at, earlyBirdEndsAt: e.early_bird_ends_at }, new Date());

  return {
    id: e.id,
    artistIds: e.artist_keys,
    artistNames: e.artist_names.length ? e.artist_names : ["Unknown artist"],
    title: e.title,
    kind: e.kind,
    venueName: e.venue_name ?? undefined,
    cityName: e.city_name ?? "City not confirmed",
    cityId: e.city_id ?? undefined,
    countryCode: e.country_code ?? "",
    when: {
      date: e.local_date ? e.local_date.toISOString().slice(0, 10) : undefined,
      startsAt: iso(e.starts_at),
      timeZone: e.time_zone,
    },
    announcedAt: iso(e.announced_at),
    ticket: {
      kind,
      verification: {
        state: ticketVerification,
        lastVerifiedAt: iso(bestTicketCheck ?? null),
        note: ticketSources.length
          ? undefined
          : primary?.source_id === "scrapingbee_news"
            ? "From a news report — no ticketing site has confirmed availability yet."
            : `${primary?.source_name ?? "This source"} doesn't provide ticket availability.`,
      },
      saleOpensAt: iso(e.sale_opens_at),
      earlyBirdEndsAt: iso(e.early_bird_ends_at),
      bookingUrl: safeTicketUrl(e.ticket_url) ?? undefined,
      price:
        e.price_currency && e.price_min !== null
          ? { min: Number(e.price_min), max: Number(e.price_max ?? e.price_min), currency: e.price_currency }
          : undefined,
    },
    source: {
      id: primary ? publicSourceId(primary.source_id) : "unknown",
      name: primary ? publicSourceName(primary.source_id, primary.source_name, primary.source_url) : "Unknown source",
      url: primary?.source_url ?? undefined,
      origin: primary?.record.sourceClass === "user_submitted" ? "user_submitted" : "event_source",
    },
    verification: {
      state: details,
      lastVerifiedAt: iso(verifyingPrimary?.last_success_at ?? null),
      note: notes.join(" ") || undefined,
    },
    origin: ordered.every((s) => s.record.sourceClass === "user_submitted") ? "user_submitted" : "event_source",
    locationConfidence: e.location_confidence,
    sources: evidence,
    possibleDuplicate: e.needs_review,
    imageUrl: e.image_url ?? undefined,
  };
}

async function hydrate(rows: EventRow[], now: Date): Promise<LiveEvent[]> {
  if (rows.length === 0) return [];
  const sql = getSql();
  const sources = await sql<SourceRow[]>`
    select event_id, source_id, source_name, source_url, first_seen_at, last_checked_at, last_success_at, record
    from radar.event_sources where event_id = any(${rows.map((r) => r.id)})`;
  const byEvent = new Map<string, SourceRow[]>();
  for (const s of sources) byEvent.set(s.event_id, [...(byEvent.get(s.event_id) ?? []), s]);
  return rows.map((r) => mapEvent(r, byEvent.get(r.id) ?? [], now));
}

/**
 * Name shown to users for a source. News-derived shows are credited to the
 * publication they came from ("News report (outlookindia.com)"); internal
 * vendor names never reach the UI.
 */
/** Source id exposed in API responses (internal vendor-named ids stay on the server). */
export function publicSourceId(sourceId: string): string {
  return sourceId === "scrapingbee_news" ? "news" : sourceId;
}

export function publicSourceName(sourceId: string, storedName: string, url: string | null): string {
  if (sourceId !== "scrapingbee_news") return storedName;
  try {
    const host = url ? new URL(url).hostname.replace(/^www\./, "") : null;
    return host ? `News report (${host})` : "News report";
  } catch {
    return "News report";
  }
}

const EVENT_COLUMNS = (sql: ReturnType<typeof getSql>) => sql`
  e.id, e.title, e.kind, e.starts_at, e.local_date, e.time_zone, e.venue_name, e.city_name, e.city_id,
  e.country_code, e.location_confidence, e.ticket_url, e.ticket_status, e.sale_opens_at, e.early_bird_ends_at,
  e.image_url, e.price_min, e.price_max, e.price_currency,
  e.event_status, e.announced_at, e.needs_review,
  coalesce(array_agg(a.catalogue_key order by ea.billing_order) filter (where a.id is not null), '{}') as artist_keys,
  coalesce(array_agg(a.name order by ea.billing_order) filter (where a.id is not null), '{}') as artist_names`;

export interface EventFilters {
  cityId?: string;
  from?: string; // YYYY-MM-DD
  to?: string;
  artistKey?: string;
  status?: "scheduled" | "cancelled" | "rescheduled";
}

/** SQL guard: hide events that carry another user's private (pasted) evidence. */
function visibleTo(sql: ReturnType<typeof getSql>, viewerId: string | null) {
  return viewerId
    ? sql`not exists (select 1 from radar.event_sources ps where ps.event_id = e.id and ps.submitted_by is not null and ps.submitted_by <> ${viewerId})`
    : sql`not exists (select 1 from radar.event_sources ps where ps.event_id = e.id and ps.submitted_by is not null)`;
}

/** Events linked to any artist the user follows, not past (unknown dates kept). */
export async function listUserEvents(userId: string, filters: EventFilters, now = new Date()): Promise<LiveEvent[]> {
  const sql = getSql();
  const rows = await sql<EventRow[]>`
    select ${EVENT_COLUMNS(sql)}
    from radar.events e
    join radar.event_artists ea on ea.event_id = e.id
    join radar.artists a on a.id = ea.artist_id
    where e.id in (
      select ea2.event_id from radar.event_artists ea2
      join radar.user_artists ua on ua.artist_id = ea2.artist_id and ua.user_id = ${userId}
      ${filters.artistKey ? sql`join radar.artists fa on fa.id = ea2.artist_id and fa.catalogue_key = ${filters.artistKey}` : sql``}
    )
    and ${visibleTo(sql, userId)}
    and (e.local_date is null or e.local_date >= ${filters.from ?? sql`(now() at time zone 'Asia/Kolkata')::date`})
    ${filters.to ? sql`and e.local_date <= ${filters.to}` : sql``}
    ${filters.cityId ? sql`and e.city_id = ${filters.cityId}` : sql``}
    ${filters.status ? sql`and e.event_status = ${filters.status}` : sql``}
    group by e.id
    order by e.local_date nulls last, e.starts_at nulls last
    limit 300`;
  return hydrate(rows, now);
}

export async function getEventById(id: string, viewerId: string | null, now = new Date()): Promise<LiveEvent | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const sql = getSql();
  const rows = await sql<EventRow[]>`
    select ${EVENT_COLUMNS(sql)}
    from radar.events e
    left join radar.event_artists ea on ea.event_id = e.id
    left join radar.artists a on a.id = ea.artist_id
    where e.id = ${id} and ${visibleTo(sql, viewerId)}
    group by e.id`;
  const [event] = await hydrate(rows, now);
  return event ?? null;
}

/**
 * Upcoming shows in one city within the next `days` days, for ANY artist we track
 * (the curated catalogue and everyone's follows) — not only the viewer's artists.
 */
export async function listCityEvents(cityId: string, days: number, viewerId: string | null, now = new Date()): Promise<LiveEvent[]> {
  const sql = getSql();
  const rows = await sql<EventRow[]>`
    select ${EVENT_COLUMNS(sql)}
    from radar.events e
    join radar.event_artists ea on ea.event_id = e.id
    join radar.artists a on a.id = ea.artist_id
    where e.city_id = ${cityId}
      and e.event_status <> 'cancelled'
      and e.local_date >= (now() at time zone 'Asia/Kolkata')::date
      and e.local_date <= (now() at time zone 'Asia/Kolkata')::date + ${days}::int
      and ${visibleTo(sql, viewerId)}
    group by e.id
    order by e.local_date, e.starts_at nulls last
    limit 60`;
  return hydrate(rows, now);
}
