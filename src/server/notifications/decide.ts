import { matchIndianCity } from "@/domain/cities";
import { FALLBACK_CITY_ID, OTHER_CITY_WINDOW_DAYS } from "@/features/discovery/city-focus";
import { deriveEventSignals, isInLocationScope } from "@/domain/event-signals";
import type { SourceClass } from "@/domain/freshness";
import type { AlertTrigger, LiveEvent, LocationPreference } from "@/domain/types";
import { TICKET_STATUS_LABEL } from "@/components/events/event-labels";
import { formatEventDate, formatTimestamp } from "@/lib/format";

/**
 * Notification decision engine — pure, deterministic, no AI.
 * Given one meaningful change (or a reminder) and one user's saved
 * preferences, decide whether to notify, with what priority, and why.
 */

export type ChangeKind =
  | "new_show"
  | "date_changed"
  | "venue_changed"
  | "city_changed"
  | "cancelled"
  | "rescheduled"
  | "ticket_status_changed"
  | "early_bird_announced"
  | "sale_date_announced"
  | "deadline_reminder";

export type NotificationCategory = "new_show" | "ticket_update" | "deadline_reminder" | "event_changed" | "cancelled";

interface ChangeRow {
  change_type: string;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
}

/**
 * Maps a stored field-level change to a user-meaningful kind, or null when
 * it isn't news (formatting, URL-only edits, info disappearing, conflicts).
 */
export function classifyChange(c: ChangeRow): ChangeKind | null {
  if (c.change_type === "created") return "new_show";
  if (c.change_type !== "updated" || !c.field) return null;
  const nv = c.new_value;
  const has = nv !== null && nv !== undefined && nv !== "";
  switch (c.field) {
    case "localDate":
      return has ? "date_changed" : null;
    case "venueName":
      return has && c.old_value ? "venue_changed" : null; // first venue announced isn't a "change"
    case "cityName":
      return has && c.old_value ? "city_changed" : null;
    case "eventStatus":
      return nv === "cancelled" ? "cancelled" : nv === "rescheduled" ? "rescheduled" : null;
    case "ticketStatus":
      if (nv === "early_bird") return "early_bird_announced";
      return has && nv !== "unknown" ? "ticket_status_changed" : null;
    case "saleOpensAt":
      return has ? "sale_date_announced" : null;
    case "earlyBirdEndsAt":
      return has ? "early_bird_announced" : null;
    default:
      return null; // startsAt, ticketUrl, cityName-without-old, etc.
  }
}

const TRIGGER_FOR: Record<ChangeKind, AlertTrigger> = {
  new_show: "new_announcement",
  date_changed: "date_or_venue_change",
  venue_changed: "date_or_venue_change",
  city_changed: "date_or_venue_change",
  cancelled: "date_or_venue_change",
  rescheduled: "date_or_venue_change",
  ticket_status_changed: "ticket_window_change",
  early_bird_announced: "ticket_window_change",
  sale_date_announced: "ticket_window_change",
  deadline_reminder: "deadline_approaching",
};

const CATEGORY_FOR: Record<ChangeKind, NotificationCategory> = {
  new_show: "new_show",
  date_changed: "event_changed",
  venue_changed: "event_changed",
  city_changed: "event_changed",
  cancelled: "cancelled",
  rescheduled: "event_changed",
  ticket_status_changed: "ticket_update",
  early_bird_announced: "ticket_update",
  sale_date_announced: "ticket_update",
  deadline_reminder: "deadline_reminder",
};

const TICKET_KINDS = new Set<ChangeKind>(["ticket_status_changed", "early_bird_announced", "sale_date_announced", "deadline_reminder"]);

export interface DecisionInput {
  kind: ChangeKind;
  event: LiveEvent;
  /** Class of the source that produced this change (deadline reminders: the ticket source). */
  sourceClass: SourceClass;
  sourceName: string;
  /** For change dedupe: the new value of the changed field. */
  newValue?: unknown;
  oldValue?: unknown;
  /** For reminders: which window (hours before the deadline) this is. */
  reminderWindowHours?: number;
  user: {
    triggers: Partial<Record<AlertTrigger, boolean>>;
    location: LocationPreference;
    followsArtist: boolean;
    savedEvent: boolean;
    mutedEvent: boolean;
  };
  now: Date;
}

export type Decision =
  | {
      notify: true;
      category: NotificationCategory;
      priority: "high" | "normal";
      title: string;
      body: string;
      reason: string;
      dedupeKey: string;
    }
  | { notify: false; skip: string };

function where(e: LiveEvent): string {
  return e.venueName ? `${e.venueName}, ${e.cityName}` : e.cityName;
}

export function decide(input: DecisionInput): Decision {
  const { kind, event: e, user, now } = input;
  if (!user.followsArtist) return { notify: false, skip: "not_following" };
  if (user.mutedEvent) return { notify: false, skip: "muted" };
  if (input.sourceClass === "user_submitted") return { notify: false, skip: "unverified_source" };
  const signals = deriveEventSignals(e, now, user.location);
  if (signals.isPast) return { notify: false, skip: "past_event" };
  if (!isInLocationScope(e, user.location)) return { notify: false, skip: "outside_location_scope" };
  if (signals.locality === "elsewhere" && user.triggers.outside_primary_city === false) {
    return { notify: false, skip: "outside_city_disabled" };
  }
  if (user.triggers[TRIGGER_FOR[kind]] === false) return { notify: false, skip: "trigger_disabled" };
  // Same focus as Discover: a new show outside your cities alerts only if it's in Bengaluru
  // or within the next 2 months (a 9-city tour shouldn't send 9 alerts).
  if (kind === "new_show" && !user.savedEvent) {
    const cityId = e.cityId ?? matchIndianCity(e.cityName)?.id;
    const start = e.when.startsAt ? Date.parse(e.when.startsAt) : e.when.date ? Date.parse(`${e.when.date}T12:00:00Z`) : NaN;
    const farAway = Number.isFinite(start) && start > now.getTime() + OTHER_CITY_WINDOW_DAYS * 86_400_000;
    const preferred = cityId === user.location.primaryCityId || cityId === FALLBACK_CITY_ID || (!!cityId && user.location.additionalCityIds.includes(cityId));
    if (!preferred && farAway) {
      return { notify: false, skip: "other_city_beyond_window" };
    }
  }

  // Only fresh, verified information may produce a notification.
  if (TICKET_KINDS.has(kind)) {
    if (e.ticket.verification.state !== "confirmed") return { notify: false, skip: "ticket_not_verified" };
  } else if (e.verification.state !== "confirmed") {
    return { notify: false, skip: "event_not_verified" };
  }
  if (kind === "deadline_reminder") {
    if (!e.ticket.earlyBirdEndsAt || !signals.earlyBirdOpen) return { notify: false, skip: "no_trustworthy_deadline" };
    const hoursLeft = (Date.parse(e.ticket.earlyBirdEndsAt) - now.getTime()) / 3_600_000;
    if (!(hoursLeft > 0) || !input.reminderWindowHours || hoursLeft > input.reminderWindowHours) {
      return { notify: false, skip: "outside_reminder_window" };
    }
  }

  const artist = e.artistNames[0] ?? "An artist you follow";
  const local = signals.locality === "primary" ? ` — your city` : signals.locality === "additional" ? ` — a city you prioritised` : "";
  const when = formatEventDate(e.when);
  const src = input.sourceName;
  const highForSaved = user.savedEvent && ["cancelled", "rescheduled", "date_changed", "venue_changed", "city_changed"].includes(kind);
  const high = kind === "deadline_reminder" || highForSaved || (kind === "new_show" && signals.earlyBirdOpen);
  const nv = input.newValue === undefined || input.newValue === null ? "" : String(input.newValue);

  // Built lazily: only the chosen kind's text is formatted (some kinds need fields others lack).
  const copy: Record<ChangeKind, () => { title: string; body: string; reason: string; key: string }> = {
    new_show: () => ({
      title: `${artist} announced a show in ${e.cityName}${local}`,
      body: `${where(e)} · ${when}.`,
      reason: `A show by an artist you follow was announced, according to ${src}.`,
      key: `new:${e.id}`,
    }),
    date_changed: () => ({
      title: `Date ${input.oldValue ? "changed" : "announced"}: ${artist} in ${e.cityName}`,
      body: `Now ${when}${input.oldValue ? ` (was ${String(input.oldValue)})` : ""}.`,
      reason: `The event date changed according to ${src}.`,
      key: `chg:${e.id}:date:${nv}`,
    }),
    venue_changed: () => ({
      title: `Venue changed: ${artist} in ${e.cityName}`,
      body: `Now at ${e.venueName ?? "a venue not yet announced"}${input.oldValue ? ` (was ${String(input.oldValue)})` : ""}.`,
      reason: `The venue changed according to ${src}.`,
      key: `chg:${e.id}:venue:${nv}`,
    }),
    city_changed: () => ({
      title: `City changed: ${artist} now in ${e.cityName}`,
      body: `${where(e)} · ${when}.`,
      reason: `The city changed according to ${src}.`,
      key: `chg:${e.id}:city:${nv}`,
    }),
    cancelled: () => ({
      title: `Cancelled: ${artist} in ${e.cityName}`,
      body: `${where(e)} · ${when}.${user.savedEvent ? " This is one of your saved shows." : ""}`,
      reason: `${src} lists this show as cancelled.`,
      key: `cancel:${e.id}`,
    }),
    rescheduled: () => ({
      title: `Rescheduled: ${artist} in ${e.cityName}`,
      body: `${where(e)} · ${when}.`,
      reason: `${src} lists this show as rescheduled.`,
      key: `resched:${e.id}:${nv}`,
    }),
    ticket_status_changed: () => ({
      title: `${TICKET_STATUS_LABEL[e.ticket.kind]}: ${artist} in ${e.cityName}`,
      body: `${where(e)} · ${when}.`,
      reason: `Ticket status updated according to ${src}.`,
      key: `tix:${e.id}:${nv}`,
    }),
    early_bird_announced: () => ({
      title: `Early-bird tickets: ${artist} in ${e.cityName}`,
      body: e.ticket.earlyBirdEndsAt
        ? `Early bird ends ${formatTimestamp(e.ticket.earlyBirdEndsAt, e.when.timeZone)} (${e.when.timeZone}).`
        : `${where(e)} · ${when}.`,
      reason: `An early-bird sale was announced, according to ${src}.`,
      // One early-bird alert per event: the status change and the deadline appearing are the same news.
      key: `eb:${e.id}`,
    }),
    sale_date_announced: () => ({
      title: `Ticket sale date announced: ${artist} in ${e.cityName}`,
      body: e.ticket.saleOpensAt ? `General sale opens ${formatTimestamp(e.ticket.saleOpensAt, e.when.timeZone)}.` : `${where(e)} · ${when}.`,
      reason: `The sale date was announced according to ${src}.`,
      key: `sale:${e.id}:${nv}`,
    }),
    deadline_reminder: () => ({
      title: `Early bird ends soon: ${artist} in ${e.cityName}`,
      body: `Deadline ${formatTimestamp(e.ticket.earlyBirdEndsAt!, e.when.timeZone)} (${e.when.timeZone}).`,
      reason: `The early-bird deadline is approaching, according to ${src}.`,
      key: `deadline:${e.id}:${e.ticket.earlyBirdEndsAt}:${input.reminderWindowHours}h`,
    }),
  };
  const c = copy[kind]();
  return {
    notify: true,
    category: CATEGORY_FOR[kind],
    priority: high ? "high" : "normal",
    title: c.title,
    body: c.body,
    reason: c.reason,
    dedupeKey: c.key,
  };
}

/** The single smallest reminder window that currently applies, so two reminders never fire at once. */
export function activeReminderWindow(deadlineIso: string, now: Date, windowsHours: number[]): number | null {
  const left = (Date.parse(deadlineIso) - now.getTime()) / 3_600_000;
  if (!(left > 0)) return null;
  const applicable = windowsHours.filter((w) => left <= w);
  return applicable.length ? Math.min(...applicable) : null;
}
