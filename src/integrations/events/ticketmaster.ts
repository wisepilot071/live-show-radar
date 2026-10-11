import { matchIndianCity } from "@/domain/cities";
import { normalizeArtistName } from "@/domain/artist-identity";
import type { TicketStatusKind } from "@/domain/types";
import { getServerEnv } from "@/config/server-env";
import { FetchError, safeFetchJson, sanitizeExternalUrl } from "@/server/safe-fetch";
import type { AdapterOutcome, EventSourceAdapter, SourceEventRecord } from "./contract";

/**
 * Ticketmaster Discovery API v2 (developer.ticketmaster.com).
 * Needs TICKETMASTER_API_KEY (free developer key; 5,000 calls/day, 5 rps).
 * Live-tested 2026-10-11 with a real key: artist searches work (e.g. an
 * artist's US/EU tour is returned), but countryCode=IN returned 0 music
 * events — Ticketmaster doesn't sell in India, so this source rarely adds
 * Indian shows. Kept so any Indian listing it does carry is picked up.
 *
 * Matching: keyword search per artist, then keep only events whose
 * attraction name equals the artist name/alias exactly (normalised) —
 * keyword hits on other acts are discarded, not guessed.
 */
const HOST = "app.ticketmaster.com";

type TmEvent = {
  id: string;
  name: string;
  url?: string;
  dates?: {
    start?: { localDate?: string; localTime?: string; dateTime?: string };
    timezone?: string;
    status?: { code?: string };
  };
  sales?: {
    public?: { startDateTime?: string };
    presales?: Array<{ name?: string; startDateTime?: string; endDateTime?: string }>;
  };
  _embedded?: {
    venues?: Array<{ name?: string; city?: { name?: string }; state?: { name?: string }; country?: { countryCode?: string }; location?: { latitude?: string; longitude?: string } }>;
    attractions?: Array<{ name?: string }>;
  };
};

function ticketStatus(code: string | undefined): { status: TicketStatusKind; eventStatus: SourceEventRecord["eventStatus"] } {
  switch (code) {
    case "onsale":
      return { status: "on_sale", eventStatus: "scheduled" };
    case "offsale":
      // "offsale" can mean sold out OR sales ended — not enough to say sold out.
      return { status: "unknown", eventStatus: "scheduled" };
    case "cancelled":
      return { status: "cancelled", eventStatus: "cancelled" };
    case "postponed":
    case "rescheduled":
      return { status: "postponed", eventStatus: "rescheduled" };
    default:
      return { status: "unknown", eventStatus: "unknown" };
  }
}

export const ticketmasterEvents: EventSourceAdapter = {
  id: "ticketmaster",
  name: "Ticketmaster",
  sourceClass: "ticketing",

  configStatus() {
    return getServerEnv().ticketmaster.apiKey
      ? { configured: true }
      : { configured: false, reason: "TICKETMASTER_API_KEY is not set" };
  },

  canLookUp: () => true,

  async fetchForArtists(artists, { deadline }): Promise<AdapterOutcome> {
    const apiKey = getServerEnv().ticketmaster.apiKey;
    if (!apiKey) return { ok: false, category: "not_configured", message: "Ticketmaster isn't configured." };
    const records: SourceEventRecord[] = [];
    const checked: string[] = [];
    const failures: Array<{ artistId: string; category: "source_unavailable" | "source_rate_limited" | "timeout" }> = [];

    for (const artist of artists) {
      if (Date.now() > deadline) break;
      const url = new URL(`https://${HOST}/discovery/v2/events.json`);
      url.searchParams.set("apikey", apiKey);
      url.searchParams.set("keyword", artist.name);
      url.searchParams.set("countryCode", "IN");
      url.searchParams.set("classificationName", "music");
      url.searchParams.set("size", "50");
      try {
        const body = (await safeFetchJson(url.toString(), { allowHosts: [HOST], timeoutMs: 8000 })) as {
          _embedded?: { events?: TmEvent[] };
        };
        const names = new Set([artist.name, ...artist.aliases].map(normalizeArtistName));
        for (const ev of body._embedded?.events ?? []) {
          const attractions = ev._embedded?.attractions ?? [];
          if (!attractions.some((a) => a.name && names.has(normalizeArtistName(a.name)))) continue;
          const venue = ev._embedded?.venues?.[0];
          const city = matchIndianCity(venue?.city?.name);
          const { status, eventStatus } = ticketStatus(ev.dates?.status?.code);
          records.push({
            sourceEventId: ev.id,
            sourceUrl: sanitizeExternalUrl(ev.url),
            title: ev.name,
            kind: "concert",
            performers: attractions.filter((a) => a.name).map((a) => ({ name: a.name! })),
            localDate: ev.dates?.start?.localDate,
            localTime: ev.dates?.start?.localTime?.slice(0, 5),
            timeZone: ev.dates?.timezone,
            venueName: venue?.name,
            cityName: city?.name ?? venue?.city?.name,
            state: venue?.state?.name ?? city?.region,
            countryCode: venue?.country?.countryCode,
            coordinates:
              venue?.location?.latitude && venue.location.longitude
                ? { lat: Number(venue.location.latitude), lon: Number(venue.location.longitude) }
                : undefined,
            eventStatus,
            ticket: {
              status,
              sourceExposesAvailability: true,
              url: sanitizeExternalUrl(ev.url),
              saleOpensAt: ev.sales?.public?.startDateTime,
              // Only a presale explicitly named "early bird" counts as an early-bird window.
              earlyBirdStartsAt: ev.sales?.presales?.find((p) => /early\s*bird/i.test(p.name ?? ""))?.startDateTime,
              earlyBirdEndsAt: ev.sales?.presales?.find((p) => /early\s*bird/i.test(p.name ?? ""))?.endDateTime,
            },
          });
        }
        checked.push(artist.artistId);
      } catch (err) {
        const category =
          err instanceof FetchError && err.status === 429 ? "source_rate_limited" : err instanceof FetchError && err.kind === "timeout" ? "timeout" : "source_unavailable";
        failures.push({ artistId: artist.artistId, category });
        if (category !== "timeout") break;
      }
    }
    if (checked.length === 0 && failures.length > 0) {
      return { ok: false, category: failures[0]!.category, message: "Ticketmaster couldn't be checked." };
    }
    return { ok: true, records, checkedArtistIds: checked, artistFailures: failures };
  },
};
