import { getSpotifyAvailability } from "@/integrations/spotify/server";
import { ok } from "@/server/http";

/** Whether the Spotify import can run on this server. No secrets, no user data. */
export function GET() {
  return ok(getSpotifyAvailability());
}
