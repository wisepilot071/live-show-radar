import { artistIdentityKey } from "@/domain/artist-identity";
import { compareByPriority, deriveEventSignals } from "@/domain/event-signals";
import type { ArtistSelection, LiveEvent, LocationPreference } from "@/domain/types";

/**
 * Discovery sections and filters for the radar, computed from the events the
 * existing /api/me/events endpoint returns. Pure and deterministic: every
 * section is a data-backed predicate over real fields — nothing is invented,
 * and a section with no matching events is simply empty.
 */

export interface DiscoveryFilters {
  /** "all" or a city id. */
  city: string;
  /** Date window from now; "any" keeps undated events too. */
  when: "any" | "30d" | "90d";
  /** "all" or an artist identity key (same keys the server uses). */
  artist: string;
  /** "all" or a genre taken from the followed artists' own tags. */
  genre: string;
}

export const DEFAULT_FILTERS: DiscoveryFilters = { city: "all", when: "any", artist: "all", genre: "all" };

const DAY = 86_400_000;

function eventTime(e: LiveEvent): number | null {
  if (e.when.startsAt) return Date.parse(e.when.startsAt);
  if (e.when.date) return Date.parse(`${e.when.date}T23:59:59+14:00`);
  return null;
}

/** Genres the user's followed artists actually carry (from the artist catalogue). */
export function genreOptions(selections: ArtistSelection[]): string[] {
  const set = new Map<string, string>();
  for (const s of selections) for (const g of s.artist.genres ?? []) set.set(g.toLowerCase(), g);
  return [...set.values()].sort((a, b) => a.localeCompare(b));
}

export function applyFilters(
  events: LiveEvent[],
  filters: DiscoveryFilters,
  ctx: { selections: ArtistSelection[]; now: Date },
): LiveEvent[] {
  const t = ctx.now.getTime();
  const genreKeys =
    filters.genre === "all"
      ? null
      : new Set(
          ctx.selections
            .filter((s) => (s.artist.genres ?? []).some((g) => g.toLowerCase() === filters.genre.toLowerCase()))
            .map((s) => artistIdentityKey(s.artist)),
        );
  return events.filter((e) => {
    if (filters.city !== "all" && e.cityId !== filters.city) return false;
    if (filters.artist !== "all" && !e.artistIds.includes(filters.artist)) return false;
    if (genreKeys && !e.artistIds.some((k) => genreKeys.has(k))) return false;
    if (filters.when !== "any") {
      const at = eventTime(e);
      if (at === null) return false; // a date window can't include an unknown date
      const days = filters.when === "30d" ? 30 : 90;
      if (at < t || at > t + days * DAY) return false;
    }
    return true;
  });
}

export interface DiscoverySections {
  /** Verified deadlines inside the window, cancellations, reschedules. */
  attention: LiveEvent[];
  /** Announced within the last week, per the source's own announcement time. */
  justAnnounced: LiveEvent[];
  /** Every upcoming show from followed artists, home city first. */
  fromYourArtists: LiveEvent[];
  /** Verified on-sale/limited tickets with a real booking link. */
  ticketsAvailable: LiveEvent[];
  /** Verified early-bird (still open) or presale. */
  earlyBird: LiveEvent[];
  /** Verified "announced, not on sale yet" or a verified future sale date. */
  comingSoon: LiveEvent[];
  /** Shows outside the home city. */
  beyondHome: LiveEvent[];
}

export function buildSections(events: LiveEvent[], location: LocationPreference, now: Date): DiscoverySections {
  const t = now.getTime();
  const sorted = [...events].sort(compareByPriority(location));
  const withSignals = sorted.map((e) => ({ e, s: deriveEventSignals(e, now, location) })).filter(({ s }) => !s.isPast);
  const pick = (pred: (e: LiveEvent, s: ReturnType<typeof deriveEventSignals>) => boolean) =>
    withSignals.filter(({ e, s }) => pred(e, s)).map(({ e }) => e);
  const confirmed = (e: LiveEvent) => e.ticket.verification.state === "confirmed";

  return {
    attention: pick((_, s) => s.deadlineApproaching || s.cancelled || s.postponed),
    justAnnounced: pick((_, s) => s.isNew),
    fromYourArtists: pick((_, s) => !s.cancelled),
    ticketsAvailable: pick(
      (e) => confirmed(e) && (e.ticket.kind === "on_sale" || e.ticket.kind === "limited") && Boolean(e.ticket.bookingUrl),
    ),
    earlyBird: pick((e, s) => s.earlyBirdOpen || (confirmed(e) && e.ticket.kind === "presale")),
    comingSoon: pick(
      (e) =>
        confirmed(e) &&
        (e.ticket.kind === "announced_not_on_sale" || (!!e.ticket.saleOpensAt && Date.parse(e.ticket.saleOpensAt) > t)),
    ),
    beyondHome: pick((e, s) => s.locality !== "primary" && !s.cancelled),
  };
}
