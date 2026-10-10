import { matchIndianCity, withinIndiaBounds } from "@/domain/cities";
import { getServerEnv } from "@/config/server-env";
import { luceneEscape, mbGet, MusicBrainzError, type MbEvent } from "@/integrations/musicbrainz/client";
import { sanitizeExternalUrl } from "@/server/safe-fetch";
import type { AdapterOutcome, EventSourceAdapter, SourceArtistRef, SourceEventRecord } from "./contract";

/**
 * MusicBrainz events — a real, open, documented source (no key).
 *
 * Honest limits: community-edited; coverage of upcoming Indian shows is thin;
 * it has NO ticket availability data, so every ticket status from here is
 * "unknown" with `sourceExposesAvailability: false`.
 *
 * Per artist: one search for upcoming events (arid + begin ≥ today), then one
 * lookup per hit to get the venue's area and coordinates. Only events we can
 * place in India are returned.
 */
const PERFORMER_TYPES = new Set(["main performer", "support act", "guest performer", "performer", "performing orchestra"]);

function today(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10); // IST calendar day
}

function toRecord(ev: MbEvent): SourceEventRecord | null {
  const placeRel = ev.relations?.find((r) => r.place && r.type === "held at") ?? ev.relations?.find((r) => r.place);
  const place = placeRel?.place;
  const lat = place?.coordinates ? Number(place.coordinates.latitude) : NaN;
  const lon = place?.coordinates ? Number(place.coordinates.longitude) : NaN;
  const city = matchIndianCity(place?.area?.name);
  const inIndiaBox = Number.isFinite(lat) && Number.isFinite(lon) && withinIndiaBounds(lat, lon);
  // Keep only events we can reasonably place in India.
  if (!city && !inIndiaBox) return null;

  const begin = ev["life-span"]?.begin;
  const fullDate = begin && /^\d{4}-\d{2}-\d{2}$/.test(begin) ? begin : undefined;
  const time = ev.time && /^\d{2}:\d{2}/.test(ev.time) ? ev.time.slice(0, 5) : undefined;
  const ticketUrl = ev.relations
    ?.filter((r) => r.url && /ticket/i.test(r.type))
    .map((r) => sanitizeExternalUrl(r.url?.resource))
    .find(Boolean);

  return {
    sourceEventId: ev.id,
    sourceUrl: `https://musicbrainz.org/event/${ev.id}`,
    title: ev.name,
    kind: /festival/i.test(ev.type ?? "") ? "festival" : "concert",
    performers: (ev.relations ?? [])
      .filter((r) => r.artist && PERFORMER_TYPES.has(r.type))
      .map((r) => ({ name: r.artist!.name, musicbrainzId: r.artist!.id })),
    localDate: fullDate,
    localTime: fullDate ? time : undefined,
    // India has a single time zone, so an Indian venue fixes it.
    timeZone: "Asia/Kolkata",
    venueName: place?.name,
    venueId: place?.id,
    areaName: place?.area?.name,
    cityName: city?.name ?? place?.area?.name,
    state: city?.region,
    countryCode: "IN",
    coordinates: inIndiaBox ? { lat, lon } : undefined,
    eventStatus: ev.cancelled ? "cancelled" : "scheduled",
    ticket: { status: "unknown", sourceExposesAvailability: false, url: ticketUrl },
  };
}

export const musicBrainzEvents: EventSourceAdapter = {
  id: "musicbrainz",
  name: "MusicBrainz",
  sourceClass: "community",

  configStatus() {
    return getServerEnv().musicbrainz.enabled
      ? { configured: true }
      : { configured: false, reason: "Disabled with MUSICBRAINZ_ENABLED=false" };
  },

  canLookUp(artist: SourceArtistRef) {
    return Boolean(artist.musicbrainzId);
  },

  async fetchForArtists(artists, { deadline }): Promise<AdapterOutcome> {
    const records: SourceEventRecord[] = [];
    const checked: string[] = [];
    const failures: Array<{ artistId: string; category: MusicBrainzError["category"] }> = [];

    for (const artist of artists) {
      if (!artist.musicbrainzId) continue;
      if (Date.now() > deadline) break; // incremental: the rest are picked up next run
      try {
        const search = await mbGet<{ events?: MbEvent[] }>(
          "event",
          { query: `arid:${luceneEscape(artist.musicbrainzId)} AND begin:[${today()} TO *]`, limit: "25" },
          { deadline },
        );
        for (const hit of search.events ?? []) {
          if (Date.now() > deadline) break;
          const full = await mbGet<MbEvent>(`event/${hit.id}`, { inc: "place-rels+artist-rels+url-rels" }, { deadline });
          const rec = toRecord(full);
          if (rec) records.push(rec);
        }
        checked.push(artist.artistId);
      } catch (err) {
        const category = err instanceof MusicBrainzError ? err.category : "source_unavailable";
        failures.push({ artistId: artist.artistId, category });
        // If MusicBrainz itself is down/rate-limiting, stop hammering it.
        if (category === "source_unavailable" || category === "source_rate_limited") break;
      }
    }

    if (checked.length === 0 && failures.length > 0) {
      return { ok: false, category: failures[0]!.category, message: "MusicBrainz couldn't be checked." };
    }
    return { ok: true, records, checkedArtistIds: checked, artistFailures: failures };
  },
};
