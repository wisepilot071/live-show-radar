import type { SpotifyAvailability } from "./contract";

/**
 * Spotify is a FRONTEND-ONLY future-feature card in this version: there is no
 * OAuth, token exchange, API call or artist import, and no Spotify
 * credentials are read. The app reports it honestly as not implemented.
 */
export function getSpotifyAvailability(): SpotifyAvailability {
  return { available: false, reason: "not_implemented" };
}
