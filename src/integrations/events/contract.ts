import type { SourceClass } from "@/domain/freshness";
import type { TicketStatusKind } from "@/domain/types";
import type { ErrorCategory } from "@/server/log";

/**
 * Event-source adapter contract.
 *
 * Each supported source (MusicBrainz, Ticketmaster, Bandsintown, …)
 * implements this once. Adapters only fetch and translate: they return
 * what the source states — missing fields stay undefined — and never write
 * to the database. Normalisation, dedup, freshness and persistence happen
 * in src/server/ingest.
 */

/** An artist the pipeline asks a source about. */
export interface SourceArtistRef {
  artistId: string; // radar.artists.id
  name: string;
  aliases: string[];
  musicbrainzId?: string;
}

/** One event as one source describes it, already in app vocabulary. */
export interface SourceEventRecord {
  sourceEventId: string;
  sourceUrl?: string;
  title: string;
  kind: "concert" | "festival" | "tour_stop";
  /** Performers as the source lists them; matched to followed artists downstream. */
  performers: Array<{ name: string; musicbrainzId?: string; artistId?: string }>;
  /** YYYY-MM-DD in the venue's local calendar, only when the source gives a full date. */
  localDate?: string;
  /** HH:MM local time, only when given. */
  localTime?: string;
  /** IANA zone, only when the source states it or the country fixes it (India). */
  timeZone?: string;
  venueName?: string;
  venueId?: string;
  areaName?: string;
  cityName?: string;
  state?: string;
  countryCode?: string;
  coordinates?: { lat: number; lon: number };
  eventStatus: "scheduled" | "cancelled" | "rescheduled" | "unknown";
  ticket: {
    status: TicketStatusKind;
    /** False when the source has no availability data at all. */
    sourceExposesAvailability: boolean;
    url?: string;
    saleOpensAt?: string;
    earlyBirdStartsAt?: string;
    earlyBirdEndsAt?: string;
  };
  sourceUpdatedAt?: string;
}

export type AdapterOutcome =
  | {
      ok: true;
      records: SourceEventRecord[];
      /** Artists the source was actually asked about. */
      checkedArtistIds: string[];
      /** Per-artist failures that didn't sink the whole run. */
      artistFailures: Array<{ artistId: string; category: ErrorCategory }>;
    }
  | { ok: false; category: ErrorCategory; message: string };

export interface SourceConfigStatus {
  configured: boolean;
  /** Why not, in plain words (e.g. "TICKETMASTER_API_KEY is not set"). */
  reason?: string;
}

export interface EventSourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly sourceClass: SourceClass;
  configStatus(): SourceConfigStatus;
  /** Whether this source can look an artist up at all (e.g. MusicBrainz needs an MBID). */
  canLookUp(artist: SourceArtistRef): boolean;
  /**
   * When true, the pipeline passes ALL target artists (everyone's follows plus the
   * curated catalogue) without its own recheck throttle; the adapter picks whom to
   * look up and reports only those in checkedArtistIds.
   */
  readonly selectsOwnArtists?: boolean;
  /** ctx.targeted: an explicit re-check of these artists (admin, or a fresh follow): skip own throttles. */
  fetchForArtists(artists: SourceArtistRef[], ctx: { deadline: number; targeted?: boolean }): Promise<AdapterOutcome>;
}
