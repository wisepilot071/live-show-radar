import { SOURCE_STRENGTH, type SourceClass } from "@/domain/freshness";
import type { TransactionSql } from "postgres";
import type { Sql } from "@/server/db";
import type { CanonicalFields, NormalizedRecord } from "./normalize";

/**
 * Idempotent write of one normalised source record, with deterministic
 * dedup. Runs in a single transaction.
 *
 * Identity rules (documented in docs/ARCHITECTURE.md §6):
 * 1. Same (source, source event id)  → same event. Re-checks update in place.
 * 2. New record from ANOTHER source with the same artist + local date + city
 *    AND the same normalised venue  → same event; the new source is attached
 *    as extra evidence.
 * 3. Same artist + date + city but venue differs or is unknown on either
 *    side  → kept SEPARATE and recorded in event_match_candidates
 *    (needs_review). We prefer two records over a wrong merge.
 * 4. Different date or city → always separate.
 * A source never merges two of its own records (it knows they differ).
 *
 * Field resolution: canonical fields are recomputed from ALL evidence rows —
 * strongest source class first, then most recently confirmed. Nulls never
 * overwrite values; a weaker source never overwrites a stronger one.
 * Disagreements on date/venue/city/status flag the event for review.
 */

type Tx = TransactionSql;

export interface UpsertResult {
  eventId: string;
  outcome: "new" | "updated" | "unchanged";
  duplicateCandidate: boolean;
}

interface EvidenceRow {
  source_id: string;
  record: { fields: CanonicalFields; sourceClass: SourceClass };
  last_success_at: Date | null;
}

const CONFLICT_FIELDS: Array<keyof CanonicalFields> = ["localDate", "venueKey", "cityId", "eventStatus"];
const TRACKED_FIELDS: Array<keyof CanonicalFields> = [
  "localDate",
  "startsAt",
  "venueName",
  "cityName",
  "eventStatus",
  "ticketStatus",
  "ticketUrl",
  "saleOpensAt",
  "earlyBirdEndsAt",
];

const INSTANT_FIELDS = new Set<keyof CanonicalFields>(["startsAt", "saleOpensAt", "earlyBirdStartsAt", "earlyBirdEndsAt"]);

/**
 * Canonical comparable form of a tracked field, by field TYPE (never by
 * guessing from string content): instants → ISO UTC, localDate → YYYY-MM-DD,
 * everything else → the raw value. Exported for tests.
 */
export function comparable(field: keyof CanonicalFields, value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (field === "localDate") {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  }
  if (INSTANT_FIELDS.has(field)) {
    const t = value instanceof Date ? value.getTime() : Date.parse(String(value));
    return Number.isNaN(t) ? String(value) : new Date(t).toISOString();
  }
  return String(value);
}

function isEmpty(field: keyof CanonicalFields, v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if ((field === "ticketStatus" || field === "eventStatus") && v === "unknown") return true;
  if (field === "locationConfidence" && v === "unknown") return true;
  return false;
}

export function mergeEvidence(rows: EvidenceRow[]): { fields: CanonicalFields; conflicts: string[] } {
  const ordered = [...rows].sort(
    (a, b) =>
      SOURCE_STRENGTH[b.record.sourceClass] - SOURCE_STRENGTH[a.record.sourceClass] ||
      (b.last_success_at?.getTime() ?? 0) - (a.last_success_at?.getTime() ?? 0),
  );
  const base = { ...ordered[0]!.record.fields };
  const keys = Object.keys(base) as Array<keyof CanonicalFields>;
  for (const key of keys) {
    // Ticket facts only come from sources that actually expose availability.
    const pool = key.startsWith("ticket") || key === "saleOpensAt" || key.startsWith("earlyBird")
      ? ordered.filter((r) => r.record.fields.ticketExposed || key === "ticketUrl")
      : ordered;
    const winner = pool.find((r) => !isEmpty(key, r.record.fields[key]));
    (base as Record<string, unknown>)[key] = winner ? winner.record.fields[key] : key === "ticketStatus" ? "unknown" : base[key];
  }
  base.ticketExposed = ordered.some((r) => r.record.fields.ticketExposed);

  const conflicts: string[] = [];
  for (const key of CONFLICT_FIELDS) {
    const values = new Set(ordered.map((r) => r.record.fields[key]).filter((v) => !isEmpty(key, v)));
    if (values.size > 1) conflicts.push(key);
  }
  return { fields: base, conflicts };
}

async function writeCanonical(tx: Tx, eventId: string, f: CanonicalFields, needsReview: boolean, matchKey: string | null, lastVerified: Date | null) {
  await tx`
    update radar.events set
      title = ${f.title}, kind = ${f.kind}, local_date = ${f.localDate}, starts_at = ${f.startsAt},
      time_zone = ${f.timeZone}, venue_name = ${f.venueName}, venue_key = ${f.venueKey},
      city_name = ${f.cityName}, city_id = ${f.cityId}, state = ${f.state}, country_code = ${f.countryCode},
      location_confidence = ${f.locationConfidence}, event_status = ${f.eventStatus},
      ticket_status = ${f.ticketStatus}, ticket_url = ${f.ticketUrl}, sale_opens_at = ${f.saleOpensAt},
      early_bird_starts_at = ${f.earlyBirdStartsAt}, early_bird_ends_at = ${f.earlyBirdEndsAt},
      needs_review = needs_review or ${needsReview},
      match_key = coalesce(${matchKey}, match_key),
      last_checked_at = now(), last_verified_at = ${lastVerified}, updated_at = now()
    where id = ${eventId}`;
}

export async function upsertRecord(sql: Sql, rec: NormalizedRecord): Promise<UpsertResult> {
  return sql.begin(async (tx): Promise<UpsertResult> => {
    const now = new Date();
    const evidenceJson = { fields: rec.fields, sourceClass: rec.sourceClass };
    const [existing] = await tx<{ event_id: string; content_hash: string }[]>`
      select event_id, content_hash from radar.event_sources
      where source_id = ${rec.sourceId} and source_event_id = ${rec.sourceEventId}
      for update`;

    let eventId: string;
    let outcome: UpsertResult["outcome"];
    let duplicateCandidate = false;

    if (existing) {
      eventId = existing.event_id;
      outcome = existing.content_hash === rec.contentHash ? "unchanged" : "updated";
      await tx`
        update radar.event_sources set
          record = ${tx.json(evidenceJson as never)}, content_hash = ${rec.contentHash}, source_url = ${rec.sourceUrl},
          source_updated_at = ${rec.sourceUpdatedAt}, last_checked_at = ${now}, last_success_at = ${now}
        where source_id = ${rec.sourceId} and source_event_id = ${rec.sourceEventId}`;
    } else {
      // Private (user-submitted) records never merge, and public records never merge
      // into a private event — otherwise private details could leak into shared data.
      const candidates =
        rec.matchKeys.length && !rec.submittedBy
          ? await tx<{ id: string; venue_key: string | null }[]>`
              select e.id, e.venue_key from radar.events e
              where e.match_key = any(${rec.matchKeys})
                and not exists (select 1 from radar.event_sources s where s.event_id = e.id and s.source_id = ${rec.sourceId})
                and not exists (select 1 from radar.event_sources s where s.event_id = e.id and s.submitted_by is not null)
              for update`
          : [];
      const confident = candidates.find((c) => c.venue_key && rec.fields.venueKey && c.venue_key === rec.fields.venueKey);
      if (confident) {
        eventId = confident.id;
        outcome = "updated";
      } else {
        const [created] = await tx<{ id: string }[]>`
          insert into radar.events (title, time_zone, match_key, first_discovered_at)
          values (${rec.fields.title}, ${rec.fields.timeZone}, ${rec.matchKeys[0] ?? null}, ${now})
          returning id`;
        eventId = created!.id;
        outcome = "new";
        for (const c of candidates) {
          duplicateCandidate = true;
          const [a, b] = c.id < eventId ? [c.id, eventId] : [eventId, c.id];
          await tx`
            insert into radar.event_match_candidates (event_id_a, event_id_b, reason)
            values (${a}, ${b}, ${"same artist, date and city; venue differs or unknown"})
            on conflict do nothing`;
          await tx`update radar.events set needs_review = true where id in (${c.id}, ${eventId})`;
        }
      }
      await tx`
        insert into radar.event_sources
          (event_id, source_id, source_name, source_event_id, source_url, source_updated_at,
           first_seen_at, last_checked_at, last_success_at, verification_state, record, content_hash, submitted_by)
        values
          (${eventId}, ${rec.sourceId}, ${rec.sourceName}, ${rec.sourceEventId}, ${rec.sourceUrl}, ${rec.sourceUpdatedAt},
           ${now}, ${now}, ${now}, ${rec.sourceClass === "user_submitted" ? "unconfirmed" : "confirmed"},
           ${tx.json(evidenceJson as never)}, ${rec.contentHash}, ${rec.submittedBy})`;
    }

    for (const [i, artistId] of rec.artistIds.entries()) {
      await tx`insert into radar.event_artists (event_id, artist_id, billing_order)
               values (${eventId}, ${artistId}, ${i}) on conflict do nothing`;
    }

    // Recompute canonical fields from all evidence and log what changed.
    const [before] = await tx<Record<string, unknown>[]>`select * from radar.events where id = ${eventId}`;
    const evidence = await tx<EvidenceRow[]>`
      select source_id, record, last_success_at from radar.event_sources where event_id = ${eventId}`;
    const { fields, conflicts } = mergeEvidence(evidence);
    const lastVerified = evidence.reduce<Date | null>(
      (m, r) => (r.last_success_at && (!m || r.last_success_at > m) ? r.last_success_at : m),
      null,
    );
    await writeCanonical(tx, eventId, fields, conflicts.length > 0, rec.matchKeys[0] ?? null, lastVerified);

    if (outcome === "new") {
      await tx`insert into radar.event_changes (event_id, change_type, source_id) values (${eventId}, 'created', ${rec.sourceId})`;
    } else if (before) {
      const col: Record<string, string> = {
        localDate: "local_date", startsAt: "starts_at", venueName: "venue_name", cityName: "city_name",
        eventStatus: "event_status", ticketStatus: "ticket_status", ticketUrl: "ticket_url",
        saleOpensAt: "sale_opens_at", earlyBirdEndsAt: "early_bird_ends_at",
      };
      for (const key of TRACKED_FIELDS) {
        const oldVal = comparable(key, before[col[key]!]);
        const newVal = comparable(key, fields[key]);
        if (oldVal !== newVal) {
          await tx`insert into radar.event_changes (event_id, change_type, field, old_value, new_value, source_id)
                   values (${eventId}, 'updated', ${key}, ${tx.json(oldVal as never)}, ${tx.json(newVal as never)}, ${rec.sourceId})`;
        }
      }
      for (const c of outcome === "unchanged" ? [] : conflicts) {
        await tx`insert into radar.event_changes (event_id, change_type, field, source_id)
                 values (${eventId}, 'conflict', ${c}, ${rec.sourceId})`;
      }
    }

    return { eventId, outcome, duplicateCandidate };
  });
}
