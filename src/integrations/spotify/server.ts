import { getServerEnv } from "@/config/server-env";
import type { SpotifyAvailability } from "./contract";

/**
 * Flip to true only when the authorise → callback (state-validated, PKCE) →
 * token storage → import flow exists. Credentials alone do not make Spotify
 * available.
 */
const OAUTH_FLOW_IMPLEMENTED = false;

export function getSpotifyAvailability(): SpotifyAvailability {
  if (!OAUTH_FLOW_IMPLEMENTED) return { available: false, reason: "not_implemented" };
  const { clientId, clientSecret, redirectUri } = getServerEnv().spotify;
  if (!clientId || !clientSecret || !redirectUri) return { available: false, reason: "credentials_missing" };
  return { available: true, reason: "ready" };
}
