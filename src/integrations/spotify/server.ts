import { getServerEnv } from "@/config/server-env";
import type { SpotifyOAuthClient } from "./client";
import type { SpotifyAvailability } from "./contract";

/** httpOnly cookie holding the OAuth state between /start and /callback. */
export const SPOTIFY_STATE_COOKIE = "lsr_spotify_state";
/** Where the person goes back to: the onboarding step or the My Artists page. */
export const RETURN_PATHS = { o: "/onboarding/artists", a: "/artists" } as const;

/**
 * Spotify import is available only when SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET
 * and a public base URL (for the OAuth redirect) are configured. No Spotify
 * tokens are stored: the import is a one-time read.
 */
export function getSpotifyAvailability(): SpotifyAvailability {
  return spotifyClient() ? { available: true, reason: "ready" } : { available: false, reason: "credentials_missing" };
}

export function spotifyClient(): SpotifyOAuthClient | null {
  const env = getServerEnv();
  if (!env.spotify.clientId || !env.spotify.clientSecret || !env.appBaseUrl) return null;
  return {
    clientId: env.spotify.clientId,
    clientSecret: env.spotify.clientSecret,
    redirectUri: `${env.appBaseUrl}/api/integrations/spotify/callback`,
  };
}
