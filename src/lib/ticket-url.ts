/**
 * Validation for external ticket links, applied when a link is stored AND again
 * before it is rendered. A link is only exposed when it is:
 * - a well-formed https:// URL (no javascript:, data:, http:, etc.)
 * - without embedded credentials, on a real hostname (not an IP / localhost)
 * - not a tracking/redirect hop (e.g. /trk/ paths, or a query parameter that
 *   carries another URL — the classic open-redirect shape)
 * Links are never constructed or guessed: this only accepts or rejects what a
 * source supplied.
 */
const REDIRECT_PARAMS = /^(url|u|redirect|redirect_url|redirect_uri|redir|r|target|dest|destination|next|to|link|goto|out)$/i;

/** Ticketing platforms we recognise as official sellers (used for labels, not as a gate). */
export const OFFICIAL_TICKET_HOSTS = [
  "ticketmaster.com",
  "ticketmaster.co.uk",
  "ticketmaster.ie",
  "ticketmaster.ae",
  "ticketmaster.ca",
  "ticketweb.com",
  "ticketweb.ca",
  "universe.com",
  "livenation.com",
  "thumpn.com",
  "district.in",
  "bookmyshow.com",
  "insider.in",
  "skillboxes.com",
  "zomato.com",
];

export function safeTicketUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2000) return undefined;
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    return undefined;
  }
  if (u.protocol !== "https:") return undefined;
  if (u.username || u.password) return undefined;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") || /^[\d.]+$/.test(host) || host.includes(":") || host === "localhost") return undefined;
  if (/\/(trk|track|redirect|redir|out|click)\//i.test(u.pathname)) return undefined;
  for (const [k, v] of u.searchParams) {
    if (REDIRECT_PARAMS.test(k) && /^(https?:)?\/\//i.test(decodeURIComponent(v))) return undefined;
  }
  return u.toString();
}

export function isOfficialTicketHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return OFFICIAL_TICKET_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
