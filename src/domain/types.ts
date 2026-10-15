/**
 * Live Show Radar — domain contracts.
 *
 * Rules that every adapter and component must respect:
 * - Unknown is a value, not an absence of a decision. Fields that an external
 *   source may omit are optional or carry an explicit "unknown" variant.
 * - Never substitute "now" for an unknown date.
 * - Timestamps are ISO-8601 strings with an offset (e.g. 2026-11-02T19:30:00+05:30).
 *   Event-local dates also carry the IANA time zone of the venue.
 */

export type IsoTimestamp = string;
/** Calendar date without time, YYYY-MM-DD. Used when a source only gives a day. */
export type IsoDate = string;
export type IanaTimeZone = string;

/* ------------------------------------------------------------------ */
/* Provenance                                                          */
/* ------------------------------------------------------------------ */

/**
 * Where a record came from. `sample_catalogue` and `illustrative` exist only so
 * that demo data can be shown honestly; they must never be presented as live.
 */
export type DataOrigin =
  | "sample_catalogue" // bundled demo catalogue of artists (real names, no event data)
  | "illustrative" // fictional event examples used only in previews
  | "user_entered" // typed by the user, not matched to any catalogue
  | "musicbrainz" // MusicBrainz open music database (artist search, events)
  | "spotify"
  | "event_source" // a supported ticketing / listing source
  | "user_submitted" // announcement text pasted by the user, extracted by Gemini
  | "curated"; // curated catalogue artist with no external id (never invented)

/**
 * The five information states the UI must keep distinct.
 * See components/ui/StatusBadge.tsx for the visual treatment.
 */
export type VerificationState =
  | "confirmed" // verified against a supported source within its freshness window
  | "unconfirmed" // seen, but not verified (e.g. single unofficial mention)
  | "stale" // was confirmed, but last check is older than the freshness window
  | "pending" // a check is scheduled or in progress
  | "unavailable"; // no supported source can provide this right now

export interface Verification {
  state: VerificationState;
  /** When a supported source last confirmed this value. Absent if never. */
  lastVerifiedAt?: IsoTimestamp;
  /** Optional 0..1 confidence from a future verification step. */
  confidence?: number;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Artists                                                             */
/* ------------------------------------------------------------------ */

export interface ArtistExternalIds {
  spotify?: string;
  musicbrainz?: string;
}

export interface Artist {
  /**
   * Stable identifier inside Live Show Radar. Format `<origin>:<key>`,
   * e.g. `sample:prateek-kuhad`, `user:the-dawn-chorus`, `spotify:4Z8W…`.
   */
  id: string;
  name: string;
  aliases?: string[];
  /** Short context to tell same-named artists apart, e.g. "Seattle grunge band". */
  disambiguation?: string;
  country?: string;
  genres?: string[];
  imageUrl?: string;
  externalIds?: ArtistExternalIds;
  origin: DataOrigin;
  /** Curated catalogue grouping (only for catalogue artists). */
  category?: "international" | "indian";
}

export type ArtistAcquisitionMethod = "spotify" | "manual" | "mix";

export interface ArtistSelection {
  artist: Artist;
  addedVia: "manual" | "spotify";
  selectedAt: IsoTimestamp;
}

/* ------------------------------------------------------------------ */
/* Location                                                            */
/* ------------------------------------------------------------------ */

export interface City {
  id: string;
  name: string;
  region: string; // state / union territory
  countryCode: "IN";
}

/**
 * Priority, not exclusion: the primary city is ranked first, extra cities are
 * ranked next, and `includeNationwide` keeps every other Indian city in scope.
 */
export interface LocationPreference {
  primaryCityId: string;
  additionalCityIds: string[];
  includeNationwide: boolean;
}

/* ------------------------------------------------------------------ */
/* Monitoring & notifications                                          */
/* ------------------------------------------------------------------ */

export type AlertTrigger =
  | "new_announcement"
  | "ticket_window_change"
  | "deadline_approaching"
  | "date_or_venue_change"
  | "outside_primary_city";

export interface NotificationPreference {
  triggers: Record<AlertTrigger, boolean>;
}

export type NotificationChannelKind = "in_app" | "email" | "telegram";

/**
 * A channel is only `active` when delivery is implemented AND the user has
 * completed setup. Everything else must say so.
 */
export type NotificationChannelStatus =
  | "active"
  | "setup_required" // implemented, user has not finished setup
  | "not_available"; // delivery not implemented yet

export interface NotificationChannel {
  kind: NotificationChannelKind;
  status: NotificationChannelStatus;
  /** User intends to use this channel once it becomes available. */
  requested: boolean;
}

/** Monitoring lifecycle for one artist. Selection ≠ monitoring. */
export type MonitoringStatus =
  | "selected" // in the user's list
  | "configured" // preferences saved server-side, waiting for a monitor
  | "monitoring_active" // a real job is checking sources
  | "coverage_incomplete"; // monitored, but not all supported sources cover this artist

export interface ArtistMonitoringState {
  artistId: string;
  status: MonitoringStatus;
  lastCheckedAt?: IsoTimestamp;
}

export interface UserPreferences {
  location: LocationPreference;
  notifications: NotificationPreference;
  channels: NotificationChannel[];
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export interface EventSource {
  id: string;
  name: string;
  /** Canonical URL of the listing at this source. */
  url?: string;
  origin: DataOrigin;
}

export type TicketStatusKind =
  | "unknown" // no evidence either way
  | "announced_not_on_sale"
  | "presale"
  | "early_bird"
  | "on_sale"
  | "limited"
  | "sold_out"
  | "cancelled"
  | "postponed";

export interface TicketStatus {
  kind: TicketStatusKind;
  verification: Verification;
  /** When general sale opens, if a source states it. */
  saleOpensAt?: IsoTimestamp;
  /** Only set when verified — never estimated. */
  earlyBirdEndsAt?: IsoTimestamp;
  /** Real booking URL from the source. Absent ⇒ no ticket action is offered. */
  bookingUrl?: string;
  /** True when bookingUrl came from a web search (official ticketing site, artist + city in the URL), not from the source itself. */
  bookingUrlFoundBySearch?: boolean;
  /** Price range exactly as the source states it (never estimated). */
  price?: { min: number; max: number; currency: string };
}

export interface EventDateTime {
  /** Day of the event, if known. */
  date?: IsoDate;
  /** Start instant, if a time is known. */
  startsAt?: IsoTimestamp;
  timeZone: IanaTimeZone;
}

export interface LiveEvent {
  id: string;
  artistIds: string[];
  /** Display names as the source printed them (for multi-artist bills). */
  artistNames: string[];
  title: string;
  kind: "concert" | "festival" | "tour_stop";
  venueName?: string;
  cityName: string;
  cityId?: string;
  countryCode: string;
  when: EventDateTime;
  announcedAt?: IsoTimestamp;
  ticket: TicketStatus;
  source: EventSource;
  /** Overall record verification (date/venue/existence). */
  verification: Verification;
  origin: DataOrigin;
  /** How the city/country was established (stored events only). */
  locationConfidence?: "matched_city" | "coordinates" | "source_country" | "unknown";
  /** All sources that reported this event (stored events only). */
  sources?: EventSourceEvidence[];
  /** Set when another record might be the same show; never auto-merged. */
  possibleDuplicate?: boolean;
  /** The ticketing source's own image for this event (not an artist photo, not a stand-in). */
  imageUrl?: string;
}

export interface EventSourceEvidence {
  sourceId: string;
  sourceName: string;
  url?: string;
  firstSeenAt: IsoTimestamp;
  lastCheckedAt: IsoTimestamp;
  lastSuccessAt?: IsoTimestamp;
  verification: VerificationState;
}

/* ------------------------------------------------------------------ */
/* Saved shows & discovery                                             */
/* ------------------------------------------------------------------ */

/**
 * A show the user saved. The snapshot is the event exactly as it was when
 * saved; once a discovery store exists, the live record (matched by eventId)
 * takes precedence and differences can be surfaced as changes.
 */
export interface SavedEvent {
  eventId: string;
  savedAt: IsoTimestamp;
  snapshot: LiveEvent;
}

/**
 * Overall outcome of a discovery run, kept distinct so the UI never confuses
 * "nothing found" with "could not check".
 */
export type DiscoveryStatus =
  | "database_unavailable" // persistence not configured/reachable: nothing stored to show
  | "never_checked" // sources configured, but no run has covered this user's artists yet
  | "not_connected" // no event source is configured
  | "ok" // at least one source answered
  | "partial" // some sources answered, some failed
  | "error"; // every registered source failed

export interface SourceCheck {
  sourceId: string;
  sourceName: string;
  outcome: "ok" | "failed" | "not_configured" | "never_run";
  checkedAt: IsoTimestamp;
  /** Safe, user-facing reason. Never a stack trace. */
  message?: string;
}

export interface DiscoveryReport {
  status: DiscoveryStatus;
  /** Server time when this report was produced. Not a "last sync" claim. */
  generatedAt: IsoTimestamp;
  /** Only set when at least one source actually answered. */
  lastSuccessfulCheckAt?: IsoTimestamp;
  sources: SourceCheck[];
  events: LiveEvent[];
  /** Artists a configured source can look up vs. ones it can't (e.g. no MusicBrainz link). */
  coverage?: { covered: number; uncovered: number; uncoveredNames: string[] };
}
