import type { LiveEvent, LocationPreference } from "./types";

/**
 * Derived, data-backed facts about an event. Every flag here is computed from
 * fields a source actually provided — nothing is set by hand and nothing is
 * guessed. The UI picks card variants and section membership from these.
 */
export interface EventSignals {
  /** Announced within NEW_WINDOW_DAYS (needs a real announcedAt). */
  isNew: boolean;
  /** Ticket kind is early_bird AND the ticket status is confirmed. */
  earlyBirdOpen: boolean;
  /** Verified early-bird deadline falls within DEADLINE_WINDOW_DAYS. */
  deadlineApproaching: boolean;
  /** Verified deadline already passed. */
  deadlinePassed: boolean;
  cancelled: boolean;
  postponed: boolean;
  /** Overall record or ticket status is not confirmed. */
  needsVerification: boolean;
  /** Event date is known and in the past. */
  isPast: boolean;
  /** Date known and not past. Unknown dates are neither upcoming nor past. */
  isUpcoming: boolean;
  locality: "primary" | "additional" | "elsewhere";
  /** Any reason the event belongs in "Important updates". */
  isImportant: boolean;
}

export const NEW_WINDOW_DAYS = 7;
export const DEADLINE_WINDOW_DAYS = 7;
const DAY = 86_400_000;

function eventInstant(event: LiveEvent): number | null {
  if (event.when.startsAt) return Date.parse(event.when.startsAt);
  // Date-only: treat end of that day (UTC+14 covers every zone) as the cutoff.
  if (event.when.date) return Date.parse(`${event.when.date}T23:59:59+14:00`);
  return null;
}

export function deriveEventSignals(event: LiveEvent, now: Date, location?: LocationPreference): EventSignals {
  const t = now.getTime();
  const ticketConfirmed = event.ticket.verification.state === "confirmed";
  const announced = event.announcedAt ? Date.parse(event.announcedAt) : null;
  const deadline = ticketConfirmed && event.ticket.earlyBirdEndsAt ? Date.parse(event.ticket.earlyBirdEndsAt) : null;
  const at = eventInstant(event);

  const isNew = announced !== null && t - announced >= 0 && t - announced <= NEW_WINDOW_DAYS * DAY;
  const deadlinePassed = deadline !== null && deadline < t;
  const deadlineApproaching = deadline !== null && !deadlinePassed && deadline - t <= DEADLINE_WINDOW_DAYS * DAY;
  const earlyBirdOpen = event.ticket.kind === "early_bird" && ticketConfirmed && !deadlinePassed;
  const cancelled = event.ticket.kind === "cancelled";
  const postponed = event.ticket.kind === "postponed";
  const needsVerification = event.verification.state !== "confirmed" || event.ticket.verification.state !== "confirmed";
  const isPast = at !== null && at < t;
  const isUpcoming = at !== null && !isPast;

  let locality: EventSignals["locality"] = "elsewhere";
  if (location && event.cityId === location.primaryCityId) locality = "primary";
  else if (location && event.cityId && location.additionalCityIds.includes(event.cityId)) locality = "additional";

  return {
    isNew,
    earlyBirdOpen,
    deadlineApproaching,
    deadlinePassed,
    cancelled,
    postponed,
    needsVerification,
    isPast,
    isUpcoming,
    locality,
    isImportant: !isPast && (isNew || deadlineApproaching || earlyBirdOpen || cancelled || postponed),
  };
}

/** True when the user's location preference keeps this event in scope. */
export function isInLocationScope(event: LiveEvent, location: LocationPreference): boolean {
  if (location.includeNationwide && event.countryCode === "IN") return true;
  return event.cityId === location.primaryCityId || (!!event.cityId && location.additionalCityIds.includes(event.cityId));
}

/** Primary city first, then additional cities, then everything else; earliest date first within each. */
export function compareByPriority(location: LocationPreference) {
  const rank = (e: LiveEvent) =>
    e.cityId === location.primaryCityId ? 0 : e.cityId && location.additionalCityIds.includes(e.cityId) ? 1 : 2;
  return (a: LiveEvent, b: LiveEvent) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    const ta = eventInstant(a) ?? Number.POSITIVE_INFINITY;
    const tb = eventInstant(b) ?? Number.POSITIVE_INFINITY;
    return ta - tb;
  };
}
