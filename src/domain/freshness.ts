import type { VerificationState } from "./types";

/**
 * Freshness rules — how long a fact stays "confirmed" after a source last
 * confirmed it. Thresholds depend on how fast the fact changes and on how
 * authoritative the source is, not on one global number.
 *
 *   ticketing  — official ticketing API (availability changes by the hour)
 *   listing    — event listing / artist tour feed (dates change occasionally)
 *   community  — community-edited catalogue (MusicBrainz): useful evidence,
 *                never authoritative on tickets
 *   user_submitted — text pasted by the user: never self-confirming
 */
export type SourceClass = "ticketing" | "listing" | "community" | "user_submitted";
export type FactKind = "event_details" | "ticket_availability";

const HOUR = 3_600_000;

export const FRESHNESS_HOURS: Record<SourceClass, Record<FactKind, number | null>> = {
  ticketing: { event_details: 24 * 3, ticket_availability: 6 },
  listing: { event_details: 24 * 7, ticket_availability: 12 },
  community: { event_details: 24 * 14, ticket_availability: null }, // never exposes availability
  user_submitted: { event_details: null, ticket_availability: null }, // never confirms on its own
};

/**
 * Display-time verification for a fact. `null` threshold ⇒ the source can't
 * confirm this kind of fact, so the best it can be is "unconfirmed" (it said
 * so) or "unavailable" (it doesn't provide it at all).
 */
export function verificationFor(
  sourceClass: SourceClass,
  fact: FactKind,
  lastSuccessAt: Date | null,
  now: Date,
  opts: { sourceProvidesFact: boolean; lastAttemptFailed?: boolean },
): VerificationState {
  if (!opts.sourceProvidesFact) return "unavailable";
  const hours = FRESHNESS_HOURS[sourceClass][fact];
  if (hours === null) return "unconfirmed";
  if (!lastSuccessAt) return opts.lastAttemptFailed ? "unavailable" : "pending";
  return now.getTime() - lastSuccessAt.getTime() <= hours * HOUR ? "confirmed" : "stale";
}

/** Strongest-first ordering used when sources disagree. */
export const SOURCE_STRENGTH: Record<SourceClass, number> = {
  ticketing: 3,
  listing: 2,
  community: 1,
  user_submitted: 0,
};
