import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeArtistName } from "@/domain/artist-identity";
import { matchIndianCity, withinIndiaBounds } from "@/domain/cities";
import type { SourceClass } from "@/domain/freshness";
import type { SourceArtistRef, SourceEventRecord } from "@/integrations/events/contract";
import { isValidTimeZone, zonedToUtcIso } from "@/lib/zoned-time";
import { sanitizeExternalUrl } from "@/server/safe-fetch";

/**
 * Deterministic normalisation: one source record → one canonical candidate.
 * No AI here. Anything that can't be validated is rejected (counted as
 * `records_rejected`), not "fixed up".
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "invalid date");
// Instants must carry an explicit offset — a bare "2026-11-09T23:59" would be read in the
// server's zone (UTC on Vercel) and silently shift by 5h30m for Indian events.
const isoInstant = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/, "timestamp needs a time zone offset")
  .refine((v) => !Number.isNaN(Date.parse(v)), "invalid timestamp");

export const sourceEventRecordSchema = z.object({
  sourceEventId: z.string().min(1).max(200),
  sourceUrl: z.string().max(2000).optional(),
  title: z.string().trim().min(1).max(300),
  kind: z.enum(["concert", "festival", "tour_stop"]),
  performers: z.array(z.object({ name: z.string().min(1).max(200), musicbrainzId: z.string().optional(), artistId: z.string().optional() })).max(50),
  localDate: isoDate.optional(),
  localTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timeZone: z.string().max(64).optional(),
  venueName: z.string().trim().max(200).optional(),
  venueId: z.string().max(200).optional(),
  areaName: z.string().max(200).optional(),
  cityName: z.string().trim().max(120).optional(),
  state: z.string().max(120).optional(),
  countryCode: z.string().max(3).optional(),
  coordinates: z.object({ lat: z.number().finite().min(-90).max(90), lon: z.number().finite().min(-180).max(180) }).optional(),
  eventStatus: z.enum(["scheduled", "cancelled", "rescheduled", "unknown"]),
  ticket: z.object({
    status: z.enum(["unknown", "announced_not_on_sale", "presale", "early_bird", "on_sale", "limited", "sold_out", "cancelled", "postponed"]),
    sourceExposesAvailability: z.boolean(),
    url: z.string().max(2000).optional(),
    saleOpensAt: isoInstant.optional(),
    earlyBirdStartsAt: isoInstant.optional(),
    earlyBirdEndsAt: isoInstant.optional(),
  }),
  sourceUpdatedAt: isoInstant.optional(),
});

/** Canonical fields one source contributes for an event. */
export interface CanonicalFields {
  title: string;
  kind: "concert" | "festival" | "tour_stop";
  localDate: string | null;
  startsAt: string | null;
  timeZone: string;
  venueName: string | null;
  venueKey: string | null;
  cityName: string | null;
  cityId: string | null;
  state: string | null;
  countryCode: string | null;
  locationConfidence: "matched_city" | "coordinates" | "source_country" | "unknown";
  eventStatus: "scheduled" | "cancelled" | "rescheduled" | "unknown";
  ticketStatus: string;
  ticketExposed: boolean;
  ticketUrl: string | null;
  saleOpensAt: string | null;
  earlyBirdStartsAt: string | null;
  earlyBirdEndsAt: string | null;
}

export interface NormalizedRecord {
  sourceId: string;
  sourceName: string;
  sourceClass: SourceClass;
  sourceEventId: string;
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
  fields: CanonicalFields;
  artistIds: string[];
  /** artist|date|city — candidates for cross-source dedup. Null when date or city unknown. */
  matchKeys: string[];
  contentHash: string;
  /** Set for user-submitted evidence: the event stays private to this user. */
  submittedBy: string | null;
}

export function venueKey(name: string | undefined | null): string | null {
  if (!name) return null;
  const k = normalizeArtistName(name)
    .replace(/\b(the|venue|hall|arena|grounds?|stadium|club|bar|auditorium|centre|center)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return k || null;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Validates and normalises a record. Performers are matched to the artists
 * the source was asked about: MusicBrainz id first, then exact normalised
 * name/alias. No fuzzy matching — an unmatched performer is simply not linked.
 */
export function normalizeRecord(
  raw: unknown,
  source: { id: string; name: string; sourceClass: SourceClass },
  asked: SourceArtistRef[],
  submittedBy: string | null = null,
): { ok: true; record: NormalizedRecord } | { ok: false; reason: string } {
  const parsed = sourceEventRecordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: parsed.error.issues[0]?.message ?? "invalid record" };
  const r: SourceEventRecord = parsed.data;

  const artistIds = new Set<string>();
  for (const p of r.performers) {
    const byMbid = p.musicbrainzId ? asked.find((a) => a.musicbrainzId === p.musicbrainzId) : undefined;
    const n = normalizeArtistName(p.name);
    const byName = byMbid ? undefined : asked.filter((a) => [a.name, ...a.aliases].some((x) => normalizeArtistName(x) === n));
    if (byMbid) artistIds.add(byMbid.artistId);
    else if (byName && byName.length === 1) artistIds.add(byName[0]!.artistId); // ambiguous names are not linked
  }
  if (artistIds.size === 0) return { ok: false, reason: "no performer matched a followed artist" };

  const city = matchIndianCity(r.cityName) ?? matchIndianCity(r.areaName);
  const timeZone = r.timeZone && isValidTimeZone(r.timeZone) ? r.timeZone : r.countryCode === "IN" ? "Asia/Kolkata" : "UTC";
  const startsAt = r.localDate && r.localTime ? (zonedToUtcIso(r.localDate, r.localTime, timeZone) ?? null) : null;
  const locationConfidence: CanonicalFields["locationConfidence"] = city
    ? "matched_city"
    : r.coordinates && withinIndiaBounds(r.coordinates.lat, r.coordinates.lon)
      ? "coordinates"
      : r.countryCode
        ? "source_country"
        : "unknown";

  const fields: CanonicalFields = {
    title: r.title,
    kind: r.kind,
    localDate: r.localDate ?? null,
    startsAt,
    timeZone,
    venueName: r.venueName ?? null,
    venueKey: venueKey(r.venueName),
    cityName: city?.name ?? r.cityName ?? null,
    cityId: city?.id ?? null,
    state: r.state ?? city?.region ?? null,
    countryCode: r.countryCode ?? null,
    locationConfidence,
    eventStatus: r.eventStatus,
    ticketStatus: r.ticket.sourceExposesAvailability ? r.ticket.status : "unknown",
    ticketExposed: r.ticket.sourceExposesAvailability,
    ticketUrl: sanitizeExternalUrl(r.ticket.url) ?? null,
    saleOpensAt: r.ticket.saleOpensAt ?? null,
    earlyBirdStartsAt: r.ticket.earlyBirdStartsAt ?? null,
    earlyBirdEndsAt: r.ticket.earlyBirdEndsAt ?? null,
  };

  const cityKey = fields.cityId ?? (fields.cityName ? normalizeArtistName(fields.cityName) : null);
  const matchKeys = fields.localDate && cityKey ? [...artistIds].map((a) => `${a}|${fields.localDate}|${cityKey}`) : [];

  return {
    ok: true,
    record: {
      sourceId: source.id,
      sourceName: source.name,
      sourceClass: source.sourceClass,
      sourceEventId: r.sourceEventId,
      sourceUrl: sanitizeExternalUrl(r.sourceUrl) ?? null,
      sourceUpdatedAt: r.sourceUpdatedAt ?? null,
      fields,
      artistIds: [...artistIds],
      matchKeys,
      contentHash: stableHash(fields),
      submittedBy,
    },
  };
}
