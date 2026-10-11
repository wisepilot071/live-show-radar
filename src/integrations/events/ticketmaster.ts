import { matchIndianCity } from "@/domain/cities";
import { normalizeArtistName } from "@/domain/artist-identity";
import type { TicketStatusKind } from "@/domain/types";
import { getServerEnv } from "@/config/server-env";
import { safeTicketUrl } from "@/lib/ticket-url";
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
 * Re-tested 2026-10-11 (scripts/diag-ticketmaster.mjs): city= Bengaluru/Bangalore/
 * Mumbai/Delhi/Chennai/Hyderabad/Pune, countryCode=IN, a 90-day window and a 50 km
 * latlong radius around Bengaluru all returned 0 events — so no city sweep here.
 *
 * Matching: keyword search per artist, then keep only events whose
 * attraction name equals the artist name/alias exactly (normalised) —
 * keyword hits on other acts (e.g. tribute bands) are discarded, not guessed.
 * Paginated (size 50, at most MAX_PAGES pages); one polite retry on HTTP 429.
 * Ticket links pass src/lib/ticket-url.ts (https only, no tracking redirects).
 */
const HOST = "app.ticketmaster.com";
const PAGE_SIZE = 50;
const MAX_PAGES = 3;

type TmImage = { url?: string; ratio?: string; width?: number; fallback?: boolean };
type TmPrice = { type?: string; currency?: string; min?: number; max?: number };

/** Ticketmaster's own image for the event: widest 16:9, served over https from its CDN. */
export function pickTmImage(images: TmImage[] | undefined): string | undefined {
  const ok = (images ?? []).filter((i) => i.url && /^https:\/\/[^/]*ticketm\.net\//.test(i.url) && !i.fallback);
  const best = ok.filter((i) => i.ratio === "16_9").sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0] ?? ok[0];
  return best?.url;
}

/** The "standard" price range as stated, or the first one; nothing when absent. */
export function pickTmPrice(ranges: TmPrice[] | undefined): { min?: number; max?: number; currency: string } | undefined {
  const r = (ranges ?? []).find((x) => x.type === "standard") ?? ranges?.[0];
  if (!r?.currency || (r.min === undefined && r.max === undefined)) return undefined;
  return { min: r.min, max: r.max, currency: r.currency.toUpperCase() };
}

type TmEvent = {
  id: string;
  name: string;
  url?: string;
  images?: TmImage[];
  priceRanges?: TmPrice[];
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
      const names = new Set([artist.name, ...artist.aliases].map(normalizeArtistName));
      try {
        for (let page = 0; page < MAX_PAGES; page++) {
          if (Date.now() > deadline) break;
          const url = new URL(`https://${HOST}/discovery/v2/events.json`);
          url.searchParams.set("apikey", apiKey);
          url.searchParams.set("keyword", artist.name);
          url.searchParams.set("countryCode", "IN");
          url.searchParams.set("classificationName", "music");
          url.searchParams.set("size", String(PAGE_SIZE));
          url.searchParams.set("page", String(page));
          const body = (await fetchWithRetry(url.toString())) as {
            _embedded?: { events?: TmEvent[] };
            page?: { totalPages?: number };
          };
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
              imageUrl: pickTmImage(ev.images),
              price: pickTmPrice(ev.priceRanges),
              ticket: {
                status,
                sourceExposesAvailability: true,
                url: safeTicketUrl(ev.url),
                saleOpensAt: ev.sales?.public?.startDateTime,
                // Only a presale explicitly named "early bird" counts as an early-bird window.
                earlyBirdStartsAt: ev.sales?.presales?.find((p) => /early\s*bird/i.test(p.name ?? ""))?.startDateTime,
                earlyBirdEndsAt: ev.sales?.presales?.find((p) => /early\s*bird/i.test(p.name ?? ""))?.endDateTime,
              },
            });
          }
          if (page + 1 >= (body.page?.totalPages ?? 0)) break;
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

/** One GET, retried once after a pause when Ticketmaster answers 429 (5 requests/second limit). */
async function fetchWithRetry(url: string): Promise<unknown> {
  try {
    return await safeFetchJson(url, { allowHosts: [HOST], timeoutMs: 8000 });
  } catch (err) {
    if (!(err instanceof FetchError && err.status === 429)) throw err;
    await new Promise((r) => setTimeout(r, 1200));
    return safeFetchJson(url, { allowHosts: [HOST], timeoutMs: 8000 });
  }
}
