import { createHash } from "node:crypto";
import { getServerEnv } from "@/config/server-env";
import { normalizeArtistName } from "@/domain/artist-identity";
import { matchIndianCity } from "@/domain/cities";
import type { Extraction } from "@/integrations/gemini/announcement-extraction";
import { articleText, groundTour, pickTicketLinks, type GroundedShow, type TourExtraction } from "@/integrations/gemini/tour-extraction";
import { geminiStatus } from "@/integrations/gemini/client";
import { FetchError, safeFetchJson, safeFetchText, sanitizeExternalUrl } from "@/server/safe-fetch";
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
 * 3. Headlines rarely carry dates, so for the most promising results the FULL
 *    article is fetched (through ScrapingBee: our server never contacts the
 *    article host) and Gemini lists the tour/concert dates in it. Each date is
 *    grounded (see tour-extraction.ts): verbatim quote naming the city, day
 *    and month; year written in the article; upcoming; known Indian city.
 * 4. If no article could be read, the snippet extraction is the fallback.
 * 5. Ticket links come only from real links in the article on known ticketing
 *    hosts (never from the AI). Class "community": it NEVER confirms tickets;
 *    a link and a stated sale date are shown as unverified.
 * 6. Records are keyed by artist + date + city, so several articles about the
 *    same tour update one record instead of creating duplicates.
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
  /** Full article HTML for a news link (optional: without it only snippets are read). */
  fetchArticle?: (url: string) => Promise<string>;
  extractTour?: (text: string) => Promise<TourExtraction>;
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

/** One record per grounded show; the id is stable per artist + date + city across articles and runs. */
export function recordsFromShows(
  artist: SourceArtistRef,
  shows: GroundedShow[],
  info: { articleUrl: string; tourName?: string; ticketUrl?: string; generalSaleOpensAt?: string },
  now: Date,
): SourceEventRecord[] {
  const saleFuture = Boolean(info.generalSaleOpensAt && Date.parse(info.generalSaleOpensAt) > now.getTime());
  return shows.map((s) => ({
    sourceEventId: createHash("sha256").update(`news|${artist.artistId}|${s.date}|${s.city.id}`).digest("hex").slice(0, 32),
    sourceUrl: info.articleUrl,
    title: info.tourName ? `${info.tourName} — ${s.city.name}` : `${artist.name} live in ${s.city.name}`,
    kind: shows.length > 1 ? "tour_stop" : "concert",
    performers: [{ name: artist.name, musicbrainzId: artist.musicbrainzId }],
    localDate: s.date,
    timeZone: "Asia/Kolkata",
    venueName: s.venue,
    cityName: s.city.name,
    state: s.city.region,
    countryCode: "IN",
    eventStatus: "scheduled",
    // Stated in the article, never verified by a ticketing source.
    ticket: {
      status: saleFuture ? "announced_not_on_sale" : "unknown",
      sourceExposesAvailability: false,
      url: info.ticketUrl,
      saleOpensAt: saleFuture ? info.generalSaleOpensAt : undefined,
    },
  }));
}

/** Prefer results that look like a schedule announcement. */
function scheduleScore(text: string): number {
  return (/\btour\b/i.test(text) ? 2 : 0) + (/\b(dates?|cities|schedule)\b/i.test(text) ? 2 : 0) + (/\btickets?\b/i.test(text) ? 1 : 0);
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
          .sort((a, b) => scheduleScore(b.text) - scheduleScore(a.text))
          .slice(0, 3); // bounded AI use per artist

        // 1. Full articles: up to 2 reads; a second read is only to find a ticket link the first lacked.
        const shows = new Map<string, SourceEventRecord>();
        let ticketUrl: string | undefined;
        let articlesRead = 0;
        if (d.fetchArticle && d.extractTour) {
          for (const { r } of candidates) {
            if (articlesRead >= 2 || (shows.size > 0 && ticketUrl) || aiPaused || Date.now() > ctx.deadline) break;
            const link = r.link ? sanitizeExternalUrl(r.link) : undefined;
            if (!link) continue;
            let html: string;
            try {
              html = await d.fetchArticle(link);
            } catch {
              continue; // unreadable article: try the next one (or the snippet fallback)
            }
            const text = articleText(html);
            if (!passesPrefilter(artist, text, now)) continue;
            articlesRead++;
            if (aiCalls++ > 0 && d.pauseMs) await new Promise((res) => setTimeout(res, d.pauseMs));
            try {
              const g = groundTour(await d.extractTour(text), text, artist, now);
              ticketUrl ??= pickTicketLinks(html, artist.name)[0];
              const info = { articleUrl: link, tourName: g.tourName, ticketUrl, generalSaleOpensAt: g.generalSaleOpensAt };
              for (const rec of recordsFromShows(artist, g.shows, info, now)) {
                if (!shows.has(rec.sourceEventId)) shows.set(rec.sourceEventId, rec);
              }
            } catch (err) {
              if ((err as { category?: string }).category === "ai_rate_limited") aiPaused = true;
              failures.push({ artistId: artist.artistId, category: "ai_unavailable" });
            }
          }
          // A ticket link found in a later article applies to every show of the tour.
          if (ticketUrl) for (const rec of shows.values()) rec.ticket.url ??= ticketUrl;
          records.push(...shows.values());
        }
        if (articlesRead > 0) continue;

        // 2. Fallback: headline + snippet only (needs a full date in the snippet).
        for (const { r, text } of candidates) {
          if (aiPaused || Date.now() > ctx.deadline) {
            failures.push({ artistId: artist.artistId, category: aiPaused ? "ai_unavailable" : "timeout" });
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

/**
 * Article HTML through ScrapingBee (no JS rendering, 1 credit). Our server only
 * talks to the allowlisted ScrapingBee host, so the article URL is never fetched
 * directly (no SSRF surface); the page is size-capped.
 */
export async function scrapingBeeArticle(url: string): Promise<string> {
  const { apiKey } = getServerEnv().scrapingbee;
  if (!apiKey) throw new FetchError("ScrapingBee not configured", "blocked");
  const u = new URL(`https://${HOST}/api/v1/`);
  u.searchParams.set("api_key", apiKey);
  u.searchParams.set("url", url);
  u.searchParams.set("render_js", "false");
  return safeFetchText(u.toString(), { allowHosts: [HOST], timeoutMs: 25_000, maxBytes: 3_000_000 });
}
