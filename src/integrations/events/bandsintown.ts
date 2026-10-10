import { matchIndianCity } from "@/domain/cities";
import { getServerEnv } from "@/config/server-env";
import { FetchError, safeFetchJson, sanitizeExternalUrl } from "@/server/safe-fetch";
import type { AdapterOutcome, EventSourceAdapter, SourceEventRecord } from "./contract";

/**
 * Bandsintown API v3 (rest.bandsintown.com).
 * Needs BANDSINTOWN_APP_ID, which Bandsintown grants only to artists, their
 * representatives, or applicants approved via API@bandsintown.com (their help
 * centre says student/educational projects are not accepted). UNTESTED against
 * the live API in Part 3 because no app_id was available.
 *
 * Tickets: an offer with status "available" means the source says tickets
 * are offered — shown as "on sale" and still subject to freshness rules.
 */
const HOST = "rest.bandsintown.com";

type BitEvent = {
  id: string;
  url?: string;
  datetime?: string; // venue-local, no offset
  title?: string;
  lineup?: string[];
  on_sale_datetime?: string;
  venue?: { name?: string; city?: string; region?: string; country?: string; latitude?: string; longitude?: string };
  offers?: Array<{ type?: string; url?: string; status?: string }>;
};

export const bandsintownEvents: EventSourceAdapter = {
  id: "bandsintown",
  name: "Bandsintown",
  sourceClass: "listing",

  configStatus() {
    return getServerEnv().bandsintown.appId
      ? { configured: true }
      : { configured: false, reason: "BANDSINTOWN_APP_ID is not set (requires approval from Bandsintown)" };
  },

  canLookUp: () => true,

  async fetchForArtists(artists, { deadline }): Promise<AdapterOutcome> {
    const appId = getServerEnv().bandsintown.appId;
    if (!appId) return { ok: false, category: "not_configured", message: "Bandsintown isn't configured." };
    const records: SourceEventRecord[] = [];
    const checked: string[] = [];
    const failures: Array<{ artistId: string; category: "source_unavailable" | "source_rate_limited" | "timeout" }> = [];

    for (const artist of artists) {
      if (Date.now() > deadline) break;
      const url = new URL(`https://${HOST}/artists/${encodeURIComponent(artist.name)}/events`);
      url.searchParams.set("app_id", appId);
      url.searchParams.set("date", "upcoming");
      try {
        const body = await safeFetchJson(url.toString(), { allowHosts: [HOST], timeoutMs: 8000 });
        for (const ev of Array.isArray(body) ? (body as BitEvent[]) : []) {
          if (ev.venue?.country !== "India") continue;
          const city = matchIndianCity(ev.venue.city);
          const [date, time] = (ev.datetime ?? "").split("T");
          const offer = ev.offers?.find((o) => o.type === "Tickets");
          records.push({
            sourceEventId: ev.id,
            sourceUrl: sanitizeExternalUrl(ev.url),
            title: ev.title || `${artist.name} live`,
            kind: "concert",
            performers: (ev.lineup ?? [artist.name]).map((name) => ({ name })),
            localDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
            localTime: time?.slice(0, 5),
            timeZone: "Asia/Kolkata",
            venueName: ev.venue.name,
            cityName: city?.name ?? ev.venue.city,
            state: ev.venue.region ?? city?.region,
            countryCode: "IN",
            coordinates:
              ev.venue.latitude && ev.venue.longitude ? { lat: Number(ev.venue.latitude), lon: Number(ev.venue.longitude) } : undefined,
            eventStatus: "scheduled",
            ticket: {
              status: offer?.status === "available" ? "on_sale" : "unknown",
              sourceExposesAvailability: Boolean(offer),
              url: sanitizeExternalUrl(offer?.url),
              saleOpensAt: ev.on_sale_datetime ? `${ev.on_sale_datetime}+05:30` : undefined,
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
      return { ok: false, category: failures[0]!.category, message: "Bandsintown couldn't be checked." };
    }
    return { ok: true, records, checkedArtistIds: checked, artistFailures: failures };
  },
};
