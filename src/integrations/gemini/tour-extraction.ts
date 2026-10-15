import { z } from "zod";
import { normalizeArtistName } from "@/domain/artist-identity";
import { matchIndianCity } from "@/domain/cities";
import type { City } from "@/domain/types";

/**
 * Reading a FULL news article for a tour/concert schedule.
 *
 * News headlines and snippets rarely carry dates; the article body does
 * ("January 9, 2027 – Ahmedabad … March 13 – Bengaluru …"). Gemini lists the
 * dates it finds, but every date only survives grounding when:
 * - its evidence quote appears verbatim in the article,
 * - that quote names the city and contains the day number and month name,
 * - the year is written in the article,
 * - the date is today or later (IST) and the city is a known Indian city.
 * Ticket links are NOT taken from the AI: they are picked deterministically
 * from real <a href> links in the article, on known ticketing hosts, whose URL
 * mentions the artist.
 */
export const TOUR_PROMPT_VERSION = "tour-v2";

export const TOUR_SYSTEM_INSTRUCTION = `You read one news article about live music in India and list the concert dates it announces.
Rules:
- Only report what the article states. Never guess or infer dates, cities, venues or ticket details.
- For each show, give the date as YYYY-MM-DD, the city, the venue if named, and "evidence": a short quote copied EXACTLY from the article that contains the city and the date.
- If the article gives no specific dates, return an empty "dates" list.
- "general_sale_opens": when general ticket sales open, as an ISO 8601 date-time with +05:30, only if the article states it; evidence must be an exact quote.
- "ticket_platform": the ticketing platform named in the article (e.g. "thumpN", "District", "BookMyShow"), with an exact quote.
- "ticket_status": "sold_out" if the article says tickets are sold out; "early_bird" if it says early-bird tickets are on sale now; "on_sale" if it says tickets are on sale, live or available to book now; otherwise null. Evidence must be an exact quote that says it.
- "early_bird_ends": when the early-bird offer ends, as an ISO 8601 date-time with +05:30, only if the article states it; exact quote.
- "price_from": the lowest ticket price in Indian rupees as digits only (e.g. "1499"), only if the article states a price; the exact quote must contain that price.
- "artist": the headline performer exactly as written.`;

const quoted = z.object({ value: z.string().nullable(), evidence: z.string().nullable() });

export const tourSchema = z.object({
  is_concert_announcement: z.boolean(),
  artist: z.string().max(200),
  tour_name: quoted,
  dates: z
    .array(z.object({ date: z.string(), city: z.string().max(80), venue: z.string().max(200).nullable(), evidence: z.string().max(400) }))
    .max(40),
  general_sale_opens: quoted,
  ticket_platform: quoted,
  // Optional so extractions cached under the old prompt still parse.
  ticket_status: quoted.optional(),
  early_bird_ends: quoted.optional(),
  price_from: quoted.optional(),
});
export type TourExtraction = z.infer<typeof tourSchema>;

const q = { type: "object", properties: { value: { type: ["string", "null"] }, evidence: { type: ["string", "null"] } }, required: ["value", "evidence"] };
export const tourJsonSchema = {
  type: "object",
  properties: {
    is_concert_announcement: { type: "boolean" },
    artist: { type: "string" },
    tour_name: q,
    dates: {
      type: "array",
      items: {
        type: "object",
        properties: { date: { type: "string" }, city: { type: "string" }, venue: { type: ["string", "null"] }, evidence: { type: "string" } },
        required: ["date", "city", "venue", "evidence"],
      },
    },
    general_sale_opens: q,
    ticket_platform: q,
    ticket_status: q,
    early_bird_ends: q,
    price_from: q,
  },
  required: ["is_concert_announcement", "artist", "tour_name", "dates", "general_sale_opens", "ticket_platform", "ticket_status", "early_bird_ends", "price_from"],
};

const ENTITIES: Record<string, string> = { "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&#39;": "'", "&rsquo;": "’", "&lsquo;": "‘", "&ndash;": "–", "&mdash;": "—", "&lt;": "<", "&gt;": ">" };

/** Visible text of an article page (scripts/styles dropped, blocks become new lines), capped. */
export function articleText(html: string, maxChars = 14_000): string {
  let h = html.replace(/<(script|style|noscript|svg|iframe|form|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ");
  const article = h.match(/<article\b[\s\S]*?<\/article>/i)?.[0];
  if (article && article.length > 2000) h = article;
  return h
    .replace(/<(br|\/p|\/li|\/h[1-6]|\/div|\/tr|li|p|h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? " ")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
    .slice(0, maxChars);
}

/** Known ticketing hosts (and their subdomains). */
const TICKET_HOSTS = ["thumpn.com", "district.in", "bookmyshow.com", "insider.in", "skillboxes.com", "ticketmaster.com", "eventbrite.com", "highape.com", "zomato.com"];

/** Real ticket links found in the article's HTML: known ticketing host + the artist named in the URL. utm_* stripped. */
export function pickTicketLinks(html: string, artistName: string): string[] {
  const tokens = normalizeArtistName(artistName)
    .split(" ")
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return [];
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1]!.replace(/&amp;/g, "&"));
    } catch {
      continue;
    }
    if (u.protocol !== "https:") continue;
    const host = u.hostname.replace(/^www\./, "");
    if (!TICKET_HOSTS.some((t) => host === t || host.endsWith(`.${t}`))) continue;
    const path = decodeURIComponent(u.pathname).toLowerCase();
    if (!tokens.some((t) => path.includes(t))) continue;
    for (const k of [...u.searchParams.keys()]) if (/^utm_/i.test(k)) u.searchParams.delete(k);
    u.hash = "";
    out.add(u.toString());
  }
  return [...out].slice(0, 3);
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const squash = (s: string) => s.toLowerCase().replace(/[\s,]+/g, " ").trim();

export interface GroundedShow {
  date: string;
  city: City;
  venue?: string;
  evidence: string;
}

export interface GroundedTour {
  artistMatches: boolean;
  tourName?: string;
  shows: GroundedShow[];
  generalSaleOpensAt?: string;
  ticketPlatform?: string;
  /** Only what the article says in so many words. */
  ticketStatus?: "on_sale" | "early_bird" | "sold_out";
  earlyBirdEndsAt?: string;
  /** Lowest stated price, in INR. */
  priceFrom?: number;
  dropped: number;
}

/** The words a quote must contain for each stated ticket status. */
const STATUS_WORDS: Record<NonNullable<GroundedTour["ticketStatus"]>, RegExp> = {
  sold_out: /sold[\s-]?out/i,
  early_bird: /early[\s-]?bird/i,
  on_sale: /on sale|are live|now live|available|book now|bookings? (?:are |is )?(?:now )?open|grab your tickets/i,
};

function istToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Keeps only what the article itself proves (see module comment). */
export function groundTour(x: TourExtraction, text: string, artist: { name: string; aliases: string[] }, now: Date): GroundedTour {
  const hay = squash(text);
  const inText = (s: string | null | undefined) => !!s && s.trim().length > 0 && hay.includes(squash(s));
  const artistMatches =
    x.is_concert_announcement &&
    [artist.name, ...artist.aliases].some((n) => normalizeArtistName(n) === normalizeArtistName(x.artist)) &&
    hay.includes(squash(artist.name));
  const today = istToday(now);
  const seen = new Set<string>();
  const shows: GroundedShow[] = [];
  let dropped = 0;
  for (const d of x.dates) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.date);
    const city = matchIndianCity(d.city);
    const ev = squash(d.evidence);
    const ok =
      m &&
      city &&
      inText(d.evidence) &&
      text.includes(m[1]!) && // the year is written in the article
      d.date >= today &&
      // the quote itself names the city and the day + month
      [city.name, city.id, d.city].some((c) => ev.includes(c.toLowerCase())) &&
      new RegExp(`(^|\\D)${Number(m[3])}(\\D|$)`).test(ev) &&
      (ev.includes(MONTHS[Number(m[2]) - 1]!) || ev.includes(MONTHS[Number(m[2]) - 1]!.slice(0, 3)));
    if (!ok || !city) {
      dropped++;
      continue;
    }
    const key = `${d.date}|${city.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    shows.push({ date: d.date, city, venue: d.venue && inText(d.venue) ? d.venue : undefined, evidence: d.evidence });
  }
  // A stated instant counts only with a verbatim quote and its year written in the article.
  const instant = (f: TourExtraction["general_sale_opens"] | undefined) =>
    f?.value && inText(f.evidence) && !Number.isNaN(Date.parse(f.value)) && text.includes(f.value.slice(0, 4)) ? new Date(f.value).toISOString() : undefined;

  const status = x.ticket_status?.value;
  const statusOk =
    (status === "on_sale" || status === "early_bird" || status === "sold_out") && inText(x.ticket_status?.evidence) && STATUS_WORDS[status].test(x.ticket_status!.evidence!);

  // The price must be written in the quote (commas ignored) next to a rupee marker.
  const price = x.price_from?.value?.replace(/[,\s]/g, "");
  const priceQuote = x.price_from?.evidence ?? "";
  const priceOk =
    !!price && /^\d{2,6}$/.test(price) && inText(priceQuote) && priceQuote.replace(/,/g, "").includes(price) && /₹|\brs\.?|\binr\b|rupees/i.test(priceQuote);

  return {
    artistMatches,
    tourName: x.tour_name.value && inText(x.tour_name.evidence) ? x.tour_name.value : undefined,
    shows: artistMatches ? shows : [],
    generalSaleOpensAt: instant(x.general_sale_opens),
    ticketPlatform: x.ticket_platform.value && inText(x.ticket_platform.evidence) ? x.ticket_platform.value : undefined,
    ticketStatus: statusOk ? status : undefined,
    earlyBirdEndsAt: statusOk && status === "early_bird" ? instant(x.early_bird_ends) : undefined,
    priceFrom: priceOk ? Number(price) : undefined,
    dropped,
  };
}

/* ------------------------------------------------------------------------ *
 * City listings: one article naming MANY artists' upcoming shows
 * ("Concerts in Bengaluru this November: …"). Same grounding rules, plus the
 * evidence quote must also name the artist.
 * ------------------------------------------------------------------------ */
export const LISTING_PROMPT_VERSION = "listing-v1";

export const LISTING_SYSTEM_INSTRUCTION = `You read one news article about live music in India and list every concert or festival performance it announces.
Rules:
- Only report what the article states. Never guess or infer artists, dates, cities, venues or times.
- One entry per artist per date. "evidence": a short quote copied EXACTLY from the article that contains the artist's name, the city and the date.
- "date" as YYYY-MM-DD; "time" as HH:MM (24h) only if the article states a start time, else null; "venue" only if named.
- Skip anything without a specific date.`;

export const listingSchema = z.object({
  shows: z
    .array(
      z.object({
        artist: z.string().max(200),
        date: z.string(),
        time: z.string().nullable(),
        city: z.string().max(80),
        venue: z.string().max(200).nullable(),
        evidence: z.string().max(500),
      }),
    )
    .max(60),
});
export type ListingExtraction = z.infer<typeof listingSchema>;

export const listingJsonSchema = {
  type: "object",
  properties: {
    shows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          artist: { type: "string" },
          date: { type: "string" },
          time: { type: ["string", "null"] },
          city: { type: "string" },
          venue: { type: ["string", "null"] },
          evidence: { type: "string" },
        },
        required: ["artist", "date", "time", "city", "venue", "evidence"],
      },
    },
  },
  required: ["shows"],
};

export interface ListingTarget {
  artistId: string;
  name: string;
  aliases: string[];
}

export interface GroundedListingShow extends GroundedShow {
  target: ListingTarget;
  time?: string;
}

/** Grounds a listing against the artists we care about; unknown artists are ignored. */
export function groundListing(
  x: ListingExtraction,
  text: string,
  targets: ListingTarget[],
  now: Date,
  /** Cities this sweep searched for: a listing's quote may omit the city named in its headline. */
  sweepCityIds: string[] = [],
): GroundedListingShow[] {
  const hay = squash(text);
  const today = istToday(now);
  const out: GroundedListingShow[] = [];
  const seen = new Set<string>();
  for (const s of x.shows) {
    const n = normalizeArtistName(s.artist);
    const matches = targets.filter((t) => [t.name, ...t.aliases].some((a) => normalizeArtistName(a) === n));
    if (matches.length !== 1) continue; // unknown or ambiguous artist
    const target = matches[0]!;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.date);
    const city = matchIndianCity(s.city);
    const ev = squash(s.evidence);
    const evNorm = normalizeArtistName(s.evidence);
    const ok =
      m &&
      city &&
      hay.includes(ev) &&
      text.includes(m[1]!) &&
      s.date >= today &&
      [target.name, ...target.aliases].some((a) => evNorm.includes(normalizeArtistName(a))) &&
      // The city may be in the quote, or (city listings) be the city this sweep searched for.
      ([city.name, city.id, s.city].some((c) => ev.includes(c.toLowerCase())) ||
        (sweepCityIds.includes(city.id) && hay.includes(city.name.toLowerCase()))) &&
      new RegExp(`(^|\\D)${Number(m[3])}(\\D|$)`).test(ev) &&
      (ev.includes(MONTHS[Number(m[2]) - 1]!) || ev.includes(MONTHS[Number(m[2]) - 1]!.slice(0, 3)));
    if (!ok || !city) continue;
    const key = `${target.artistId}|${s.date}|${city.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // A start time only counts when its hour is in the quote next to am/pm or a colon.
    const tm = s.time && /^(\d{1,2}):(\d{2})$/.exec(s.time);
    const hour12 = tm ? ((Number(tm[1]) + 11) % 12) + 1 : null;
    const timeOk =
      tm && hour12 !== null && new RegExp(`(^|\\D)(${Number(tm[1])}|${hour12})(:\\d{2})?\\s*(am|pm|p\\.m|a\\.m|hrs)`, "i").test(s.evidence);
    out.push({
      date: s.date,
      city,
      venue: s.venue && hay.includes(squash(s.venue)) ? s.venue : undefined,
      evidence: s.evidence,
      target,
      time: timeOk ? `${tm![1]!.padStart(2, "0")}:${tm![2]}` : undefined,
    });
  }
  return out;
}
