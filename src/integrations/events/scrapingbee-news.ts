import { createHash } from "node:crypto";
import { getServerEnv } from "@/config/server-env";
import { normalizeArtistName } from "@/domain/artist-identity";
import { matchIndianCity } from "@/domain/cities";
import type { Extraction } from "@/integrations/gemini/announcement-extraction";
import { geminiStatus } from "@/integrations/gemini/client";
import { FetchError, safeFetchJson, sanitizeExternalUrl } from "@/server/safe-fetch";
import type { AdapterOutcome, EventSourceAdapter, SourceArtistRef, SourceEventRecord } from "./contract";

/**
 * Concert-announcement discovery from Indian news via ScrapingBee's Google
 * Search API (https://www.scrapingbee.com/documentation/google/), news mode.
 * Verified 2026-10-11 with a real request: results carry title, snippet,
 * source and link — but NO structured event fields and no dates.
 *
 * So this source is deliberately conservative:
 * 1. One news search per artist (10 API credits each), capped per run.
 * 2. Deterministic pre-filter: the snippet must name the artist and mention
 *    the current or next year — stale coverage never reaches the AI.
 * 3. Gemini (existing extraction, cached by text) reads title + snippet; the
 *    same grounding as pasted announcements drops anything not in the text.
 * 4. Only kept when the artist matches exactly, a FULL date (with year) is
 *    stated and is today or later, and the city is a known Indian city.
 * 5. Class "community": event details only; it NEVER confirms tickets. The
 *    article link is the evidence; no ticket URL is taken from snippets.
 */
const HOST = "app.scrapingbee.com";

export interface NewsResult {
  title?: string;
  snippet?: string;
  link?: string;
  source?: string;
  date?: string;
}

export interface ScrapingBeeDeps {
  search: (query: string) => Promise<NewsResult[]>;
  extract: (text: string) => Promise<Extraction>;
  ground: (x: Extraction, text: string) => { x: Extraction };
  now: () => Date;
  /** Pause between AI calls (free Gemini tiers allow only a few requests per minute). */
  pauseMs?: number;
}

function istToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Cheap, deterministic gate before any AI call. */
export function passesPrefilter(artist: SourceArtistRef, text: string, now: Date): boolean {
  const norm = normalizeArtistName(text);
  const named = [artist.name, ...artist.aliases].some((n) => {
    const a = normalizeArtistName(n);
    return a.length >= 3 && norm.includes(a);
  });
  if (!named) return false;
  const y = now.getUTCFullYear();
  return text.includes(String(y)) || text.includes(String(y + 1));
}

/** Turns one grounded extraction into a record, or null when it isn't trustworthy enough. */
export function recordFrom(artist: SourceArtistRef, item: NewsResult, x: Extraction, now: Date): SourceEventRecord | null {
  if (!x.is_event_announcement || x.announcement_type === "not_an_event") return null;
  const matchesArtist = x.artists.some((a) =>
    [artist.name, ...artist.aliases].some((n) => normalizeArtistName(n) === normalizeArtistName(a.name)),
  );
  if (!matchesArtist) return null;
  const date = x.date.value;
  if (!date || date < istToday(now)) return null; // full, explicit, upcoming dates only
  const city = matchIndianCity(x.city.value);
  if (!city) return null;
  const link = item.link ? sanitizeExternalUrl(item.link) : undefined;
  if (!link) return null;
  const id = createHash("sha256").update(`${link}|${artist.artistId}|${date}|${city.id}`).digest("hex").slice(0, 32);
  return {
    sourceEventId: id,
    sourceUrl: link,
    title: x.event_title.value ?? `${artist.name} live in ${city.name}`,
    kind: "concert",
    performers: [{ name: artist.name, musicbrainzId: artist.musicbrainzId }],
    localDate: date,
    localTime: x.start_time.value ?? undefined,
    timeZone: "Asia/Kolkata",
    venueName: x.venue.value ?? undefined,
    cityName: city.name,
    state: city.region,
    countryCode: "IN",
    eventStatus: x.announcement_type === "cancelled" ? "cancelled" : "scheduled",
    // A news snippet is never evidence of ticket availability.
    ticket: { status: "unknown", sourceExposesAvailability: false },
  };
}

export function createScrapingBeeNewsAdapter(deps: () => ScrapingBeeDeps | null): EventSourceAdapter {
  return {
    id: "scrapingbee_news",
    name: "News announcements (ScrapingBee)",
    sourceClass: "community",
    configStatus() {
      if (!getServerEnv().scrapingbee.apiKey) return { configured: false, reason: "SCRAPINGBEE_API_KEY is not set" };
      if (!geminiStatus().configured) return { configured: false, reason: "needs Gemini (GEMINI_API_KEY) to read articles" };
      return { configured: true };
    },
    canLookUp: (a) => a.name.trim().length >= 3,
    async fetchForArtists(artists, ctx): Promise<AdapterOutcome> {
      const d = deps();
      if (!d) return { ok: false, category: "not_configured", message: "ScrapingBee news isn't configured" };
      const cap = getServerEnv().scrapingbee.maxArtistsPerRun;
      const records: SourceEventRecord[] = [];
      const checked: string[] = [];
      const failures: Array<{ artistId: string; category: "source_unavailable" | "source_rate_limited" | "timeout" | "ai_unavailable" }> = [];
      const now = d.now();
      let aiPaused = false;
      let aiCalls = 0;
      for (const artist of artists.slice(0, cap)) {
        if (Date.now() > ctx.deadline) break;
        let results: NewsResult[];
        try {
          results = await d.search(`"${artist.name}" concert India ${now.getUTCFullYear()}`);
        } catch (err) {
          const category = err instanceof FetchError && err.status === 429 ? "source_rate_limited" : err instanceof FetchError && err.kind === "timeout" ? "timeout" : "source_unavailable";
          if (checked.length === 0 && failures.length === 0 && category !== "timeout") {
            // First call failed outright (bad key, no credits, outage): report the source as failed.
            return { ok: false, category, message: err instanceof Error ? err.message : "ScrapingBee request failed" };
          }
          failures.push({ artistId: artist.artistId, category });
          continue;
        }
        checked.push(artist.artistId);
        const candidates = results
          .map((r) => ({ r, text: [r.title, r.snippet].filter(Boolean).join("\n") }))
          .filter(({ text }) => passesPrefilter(artist, text, now))
          .slice(0, 3); // bounded AI use per artist
        for (const { r, text } of candidates) {
          if (aiPaused || Date.now() > ctx.deadline) {
            failures.push({ artistId: artist.artistId, category: "ai_unavailable" });
            break;
          }
          if (aiCalls++ > 0 && d.pauseMs) await new Promise((res) => setTimeout(res, d.pauseMs));
          try {
            const { x } = d.ground(structuredClone(await d.extract(text)), text);
            const rec = recordFrom(artist, r, x, now);
            if (rec) records.push(rec);
          } catch (err) {
            // Rate-limited by Gemini: stop reading articles for the rest of this run (retried next run).
            if ((err as { category?: string }).category === "ai_rate_limited") aiPaused = true;
            failures.push({ artistId: artist.artistId, category: "ai_unavailable" });
          }
        }
      }
      return { ok: true, records, checkedArtistIds: checked, artistFailures: failures };
    },
  };
}

/** Real ScrapingBee news search (allowlisted host, no redirects, size-capped). */
export async function scrapingBeeNewsSearch(query: string): Promise<NewsResult[]> {
  const { apiKey } = getServerEnv().scrapingbee;
  if (!apiKey) throw new FetchError("ScrapingBee not configured", "blocked");
  const u = new URL(`https://${HOST}/api/v1/google`);
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("search", query);
  u.searchParams.set("search_type", "news");
  u.searchParams.set("country_code", "in");
  u.searchParams.set("nb_results", "10");
  const body = (await safeFetchJson(u.toString(), { allowHosts: [HOST], timeoutMs: 25_000 })) as { news_results?: NewsResult[] };
  return Array.isArray(body.news_results) ? body.news_results : [];
}
