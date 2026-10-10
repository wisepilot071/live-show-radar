import { bandsintownEvents } from "./bandsintown";
import type { EventSourceAdapter } from "./contract";
import { musicBrainzEvents } from "./musicbrainz";
import { ticketmasterEvents } from "./ticketmaster";

/**
 * Every event source the app knows about. A source participates in
 * discovery only when `configStatus().configured` is true; the rest are
 * reported as "not configured" — never as connected.
 */
export const EVENT_SOURCES: readonly EventSourceAdapter[] = [musicBrainzEvents, ticketmasterEvents, bandsintownEvents];

export function configuredSources(): EventSourceAdapter[] {
  return EVENT_SOURCES.filter((s) => s.configStatus().configured);
}
