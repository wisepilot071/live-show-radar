import { cityNameVariants } from "@/domain/cities";
import { isOfficialTicketHost, safeTicketUrl } from "@/lib/ticket-url";
import { searchWeb } from "./client";

/**
 * Finds the official ticket page for one show by web search (Gemini's Google
 * Search grounding), for shows whose news article carried no ticket link.
 *
 * Only Google's actual result pages are considered, never a URL the model
 * typed (seen live: it wrote a near-miss District URL). A result is accepted
 * only when ALL of these hold:
 *   - it's https on an official ticketing host (District, BookMyShow, …) —
 *     social posts, resellers and "event listing" sites are never used, since
 *     a link that merely claims to sell tickets can be a scam;
 *   - its path names the artist (every word) AND the show's city;
 *   - it carries no date that contradicts the show's date.
 * Ticket pages themselves are never fetched or scraped: we store the link only.
 */
const REDIRECT_HOST = "vertexaisearch.cloud.google.com";
const STOP_WORDS = new Set(["the", "and", "n", "a", "of"]);

function words(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** True when a ticket URL's path names this artist and city, and no other date. */
export function urlMatchesShow(url: string, show: { artistName: string; cityId: string; date: string }): boolean {
  const safe = safeTicketUrl(url);
  if (!safe || !isOfficialTicketHost(safe)) return false;
  const path = decodeURIComponent(new URL(safe).pathname);
  const pathWords = words(path);
  const compact = pathWords.join("");
  const has = (phrase: string) => {
    const w = words(phrase);
    // "guns-n-roses" and "gunsnroses" both count; a word must match whole, not inside another word.
    return w.join("").length > 0 && (compact.includes(w.join("")) || w.every((x) => pathWords.includes(x)));
  };
  // Every meaningful word of the artist's name ("guns", "roses"), or the whole name run together.
  const artistWords = words(show.artistName).filter((w) => !STOP_WORDS.has(w));
  const artistOk = artistWords.length > 0 && (artistWords.every((w) => pathWords.includes(w)) || compact.includes(words(show.artistName).join("")));
  if (!artistOk) return false;
  if (!cityNameVariants(show.cityId).some(has)) return false;
  const datesInPath = path.match(/20\d\d-\d\d-\d\d/g) ?? [];
  return datesInPath.every((d) => d === show.date);
}

/** Resolves Google's grounding redirect to the real page URL, without visiting that page. */
async function resolveResult(uri: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return null;
  }
  if (u.hostname !== REDIRECT_HOST) return u.protocol === "https:" ? u.toString() : null;
  try {
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    return res.headers.get("location");
  } catch {
    return null;
  }
}

export interface TicketSearchResult {
  url: string | null;
  /** How many search results were looked at. */
  considered: number;
}

export async function findTicketPage(show: { artistName: string; cityId: string; cityName: string; date: string }): Promise<TicketSearchResult> {
  const month = new Date(`${show.date}T00:00:00Z`).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  const { results } = await searchWeb(`${show.artistName} concert ${show.cityName} ${month} tickets`);
  for (const r of results) {
    const real = await resolveResult(r.uri);
    if (real && urlMatchesShow(real, show)) return { url: safeTicketUrl(real) ?? null, considered: results.length };
  }
  return { url: null, considered: results.length };
}
