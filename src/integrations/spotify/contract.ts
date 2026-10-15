import type { Artist } from "@/domain/types";

/**
 * Spotify integration contract. Implemented as a one-time import
 * (src/integrations/spotify/client.ts, src/server/spotify-import.ts).
 *
 * Verified against Spotify's Web API docs on 2026-10-11:
 * - GET /v1/me/following?type=artist  — requires `user-follow-read`; cursor
 *   paginated, max 50 per page. Not listed as removed in the February 2026
 *   Development Mode migration guide (only the follow/unfollow write and
 *   "contains" endpoints moved to /me/library).
 * - GET /v1/me/top/artists            — requires `user-top-read`.
 * - Development Mode apps: owner needs Spotify Premium; new apps are limited
 *   to 5 users; artist `followers`/`popularity` fields were removed.
 * Re-verified 2026-10-15 when the import was built.
 *
 * The permission copy shown in the UI is generated from SPOTIFY_PLANNED_SCOPES,
 * so it can never drift from the scopes actually requested.
 */
export const SPOTIFY_PLANNED_SCOPES = [
  {
    scope: "user-follow-read",
    title: "Artists you follow",
    usage: "To add the artists you already follow on Spotify to your radar.",
  },
  {
    scope: "user-top-read",
    title: "Your top artists",
    usage: "To add the artists you listen to most, even if you don't follow them.",
  },
] as const;

/** Every state the connection UI must be able to represent. */
export type SpotifyConnectionStatus =
  | "unavailable" // integration not implemented / not configured on this server
  | "not_connected"
  | "connecting"
  | "connected"
  | "partial_import"
  | "no_usable_data"
  | "permission_denied"
  | "cancelled"
  | "session_expired"
  | "temporary_failure"
  | "manual_fallback";

export interface SpotifyImportResult {
  status: Extract<SpotifyConnectionStatus, "connected" | "partial_import" | "no_usable_data">;
  artists: Artist[]; // origin: "spotify", externalIds.spotify set
  /** Which sources contributed, e.g. followed + top. */
  sources: Array<"followed" | "top">;
  importedAt: string;
}

/**
 * Server-side importer. Tokens live only on the server (encrypted session or
 * database); client components only ever see SpotifyConnectionStatus and the
 * resulting Artist records.
 */
export interface SpotifyArtistImporter {
  importArtists(userId: string): Promise<SpotifyImportResult>;
}

/** What the browser is allowed to know about Spotify. */
export interface SpotifyAvailability {
  /** True only when the OAuth flow is implemented AND credentials are present. */
  available: boolean;
  reason: "not_implemented" | "credentials_missing" | "ready";
}
