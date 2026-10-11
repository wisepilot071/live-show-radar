import { bandsintownEvents } from "./bandsintown";
import type { EventSourceAdapter } from "./contract";
import { musicBrainzEvents } from "./musicbrainz";
import { extractCached, ground } from "@/server/announcements";
import { createScrapingBeeNewsAdapter, scrapingBeeNewsSearch } from "./scrapingbee-news";
import { ticketmasterEvents } from "./ticketmaster";

/** News-announcement discovery wired to the real ScrapingBee search + cached Gemini extraction. */
export const scrapingBeeNewsEvents = createScrapingBeeNewsAdapter(() => ({
  search: scrapingBeeNewsSearch,
  extract: async (text) => (await extractCached(text)).x,
  ground,
  now: () => new Date(),
  pauseMs: 4000,
}));

/**
 * Every event source the app knows about. A source participates in
 * discovery only when `configStatus().configured` is true; the rest are
 * reported as "not configured" — never as connected.
 */
export const EVENT_SOURCES: readonly EventSourceAdapter[] = [musicBrainzEvents, ticketmasterEvents, scrapingBeeNewsEvents, bandsintownEvents];

export function configuredSources(): EventSourceAdapter[] {
  return EVENT_SOURCES.filter((s) => s.configStatus().configured);
}
