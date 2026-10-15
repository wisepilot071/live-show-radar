import { createHash } from "node:crypto";
import { getServerEnv } from "@/config/server-env";
import { normalizeArtistName } from "@/domain/artist-identity";
import { matchIndianCity } from "@/domain/cities";
import type { Extraction } from "@/integrations/gemini/announcement-extraction";
import {
  articleText,
  groundListing,
  groundTour,
  pickTicketLinks,
  type GroundedShow,
  type GroundedTour,
  type ListingExtraction,
  type TourExtraction,
} from "@/integrations/gemini/tour-extraction";
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
  /** Multi-artist "concerts in <city>" articles (the daily city sweep). */
  extractListing?: (text: string) => Promise<ListingExtraction>;
  /**
   * Cities to sweep THIS run (DB-gated: Bengaluru daily, users' other home cities in
   * rotation), e.g. ["Bengaluru"]. Empty when nothing is due.
   */
  sweepCities?: () => Promise<string[]>;
  /** Picks which artists get their own (more expensive) news search this run. */
  dueForArtistScan?: (artists: SourceArtistRef[], cap: number) => Promise<SourceArtistRef[]>;
  /** Remaining ScrapingBee credits, or null when unknown. */
  creditsLeft?: () => Promise<number | null>;
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
/** The ticket facts a grounded tour article stated. */
function ticketFacts(g: GroundedTour) {
  return { generalSaleOpensAt: g.generalSaleOpensAt, ticketStatus: g.ticketStatus, earlyBirdEndsAt: g.earlyBirdEndsAt, priceFrom: g.priceFrom };
}

export function recordsFromShows(
  artist: SourceArtistRef,
  shows: GroundedShow[],
  info: {
    articleUrl: string;
    tourName?: string;
    ticketUrl?: string;
    generalSaleOpensAt?: string;
    ticketStatus?: GroundedTour["ticketStatus"];
    earlyBirdEndsAt?: string;
    priceFrom?: number;
  },
  now: Date,
): SourceEventRecord[] {
  // What the article states wins; otherwise a stated sale date means "announced". Once that
  // date has passed the read side shows it as on sale (src/domain/ticket-timeline.ts).
  const status: SourceEventRecord["ticket"]["status"] = info.ticketStatus ?? (info.generalSaleOpensAt ? "announced_not_on_sale" : "unknown");
  const earlyBirdLive = info.ticketStatus === "early_bird" && (!info.earlyBirdEndsAt || Date.parse(info.earlyBirdEndsAt) > now.getTime());
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
      status: info.ticketStatus === "early_bird" && !earlyBirdLive ? "on_sale" : status,
      sourceExposesAvailability: false,
      url: info.ticketUrl,
      saleOpensAt: info.generalSaleOpensAt,
      earlyBirdEndsAt: earlyBirdLive ? info.earlyBirdEndsAt : undefined,
    },
    price: info.priceFrom ? { min: info.priceFrom, currency: "INR" } : undefined,
  }));
}

/** Credits kept in reserve: below these, the sweep / per-artist searches stop (searches cost 10, articles 1). */
export const SWEEP_MIN_CREDITS = 40;
export const ARTIST_SCAN_MIN_CREDITS = 150;
const SWEEP_MONTHS = 3; // this month + the next two (the "next 2 months" window)
const SWEEP_ARTICLES = 4;

function monthQueries(city: string, now: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < SWEEP_MONTHS; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
    out.push(`concerts in ${city} ${d.toLocaleString("en-IN", { month: "long", timeZone: "UTC" })} ${d.getUTCFullYear()}`);
  }
  return out;
}

/**
 * The daily city sweep: a few "concerts in <city> <month>" news searches, the best
 * few articles read in full, and every grounded show matched against ALL target
 * artists (everyone's follows + the catalogue) in one pass. Much cheaper than a
 * search per artist on a small credit plan.
 */
export async function runCitySweep(
  d: ScrapingBeeDeps,
  cities: string[],
  targets: SourceArtistRef[],
  now: Date,
  deadline: number,
): Promise<{ records: SourceEventRecord[]; aiRateLimited: boolean }> {
  const records = new Map<string, SourceEventRecord>();
  if (!d.fetchArticle || !d.extractListing || cities.length === 0 || targets.length === 0) return { records: [], aiRateLimited: false };
  const names = targets.flatMap((t) => [t.name, ...t.aliases]).map(normalizeArtistName).filter((n) => n.length >= 4);
  const seen = new Set<string>();
  const results: Array<{ r: NewsResult; score: number }> = [];
  for (const city of cities) {
    for (const q of monthQueries(city, now)) {
      if (Date.now() > deadline) break;
      let found: NewsResult[] = [];
      try {
        found = await d.search(q);
      } catch {
        continue;
      }
      for (const r of found) {
        if (!r.link || seen.has(r.link)) continue;
        seen.add(r.link);
        const t = normalizeArtistName([r.title, r.snippet].filter(Boolean).join(" "));
        const hits = names.filter((n) => t.includes(n)).length;
        results.push({ r, score: hits * 3 + scheduleScore(`${r.title ?? ""} ${r.snippet ?? ""}`) + (/\b(upcoming|lineup|events|gigs|this (week|month))\b/i.test(t) ? 2 : 0) });
      }
    }
  }
  results.sort((a, b) => b.score - a.score);
  const sweptCityIds = cities.map((c) => matchIndianCity(c)?.id).filter((id): id is string => Boolean(id));
  let aiRateLimited = false;
  let calls = 0;
  for (const { r } of results.slice(0, SWEEP_ARTICLES)) {
    if (Date.now() > deadline) break;
    const link = sanitizeExternalUrl(r.link);
    if (!link) continue;
    let html: string;
    try {
      html = await d.fetchArticle(link);
    } catch {
      continue;
    }
    const text = articleText(html);
    if (calls++ > 0 && d.pauseMs) await new Promise((res) => setTimeout(res, d.pauseMs));
    try {
      const shows = groundListing(await d.extractListing(text), text, targets, now, sweptCityIds);
      for (const s of shows) {
        const artist = targets.find((t) => t.artistId === s.target.artistId)!;
        const [rec] = recordsFromShows(artist, [s], { articleUrl: link, ticketUrl: pickTicketLinks(html, artist.name)[0] }, now);
        if (!rec) continue;
        rec.kind = "concert";
        if (s.time) rec.localTime = s.time;
        if (!records.has(rec.sourceEventId)) records.set(rec.sourceEventId, rec);
      }
      // An article that is really about ONE artist's tour (named in the headline): read it
      // again as a tour schedule — same article, so no extra ScrapingBee credit.
      const title = normalizeArtistName(r.title ?? "");
      const tourArtists = targets.filter((t) => [t.name, ...t.aliases].some((a) => normalizeArtistName(a).length >= 4 && title.includes(normalizeArtistName(a))));
      if (d.extractTour && tourArtists.length === 1 && /\btour\b/i.test(r.title ?? "")) {
        const artist = tourArtists[0]!;
        if (d.pauseMs) await new Promise((res) => setTimeout(res, d.pauseMs));
        const g = groundTour(await d.extractTour(text), text, artist, now);
        const info = { articleUrl: link, tourName: g.tourName, ticketUrl: pickTicketLinks(html, artist.name)[0], ...ticketFacts(g) };
        for (const rec of recordsFromShows(artist, g.shows, info, now)) records.set(rec.sourceEventId, rec);
      }
    } catch (err) {
      if ((err as { category?: string }).category === "ai_rate_limited") {
        aiRateLimited = true;
        break;
      }
    }
  }
  return { records: [...records.values()], aiRateLimited };
}

/** Prefer results that look like a schedule announcement. */
function scheduleScore(text: string): number {
  return (/\btour\b/i.test(text) ? 2 : 0) + (/\b(dates?|cities|schedule)\b/i.test(text) ? 2 : 0) + (/\btickets?\b/i.test(text) ? 1 : 0);
}

export function createScrapingBeeNewsAdapter(deps: () => ScrapingBeeDeps | null): EventSourceAdapter {
  return {
    id: "scrapingbee_news",
    // Public name: the retrieval vendor is an implementation detail and never shown to users.
    name: "News reports",
    sourceClass: "community",
    configStatus() {
      if (!getServerEnv().scrapingbee.apiKey) return { configured: false, reason: "news search isn't configured on this server" };
      if (!geminiStatus().configured) return { configured: false, reason: "article reading (AI) isn't configured on this server" };
      return { configured: true };
    },
    canLookUp: (a) => a.name.trim().length >= 3,
    // Gets ALL target artists (follows + catalogue) and decides itself who gets a
    // per-artist search; the daily city sweep covers everyone at once.
    selectsOwnArtists: true,
    async fetchForArtists(allArtists, ctx): Promise<AdapterOutcome> {
      const d = deps();
      if (!d) return { ok: false, category: "not_configured", message: "ScrapingBee news isn't configured" };
      const cap = getServerEnv().scrapingbee.maxArtistsPerRun;
      const records: SourceEventRecord[] = [];
      const checked: string[] = [];
      const failures: Array<{ artistId: string; category: "source_unavailable" | "source_rate_limited" | "timeout" | "ai_unavailable" }> = [];
      const now = d.now();
      let aiPaused = false;
      let aiCalls = 0;

      const credits = d.creditsLeft ? await d.creditsLeft() : null;
      // 1. Daily city sweep (all targets at once).
      // Not on targeted re-checks: the daily sweep must see every target artist, not a few.
      const cities = !ctx.targeted && (credits === null || credits >= SWEEP_MIN_CREDITS) && d.sweepCities ? await d.sweepCities() : [];
      if (cities.length > 0) {
        const sweep = await runCitySweep(d, cities, allArtists, now, ctx.deadline);
        records.push(...sweep.records);
        aiPaused = sweep.aiRateLimited;
        aiCalls = 1;
      }
      // 2. Per-artist searches: only when credits allow, a few per run, least recently checked first.
      const artists =
        credits !== null && credits < ARTIST_SCAN_MIN_CREDITS
          ? []
          : d.dueForArtistScan && !ctx.targeted
            ? await d.dueForArtistScan(allArtists, cap)
            : allArtists.slice(0, cap);
      for (const artist of artists) {
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
              const info = { articleUrl: link, tourName: g.tourName, ticketUrl, ...ticketFacts(g) };
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
