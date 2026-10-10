import type { StatusTone } from "@/components/ui/StatusBadge";
import type { SpotifyConnectionStatus } from "@/integrations/spotify/contract";

/** User-facing copy for every connection state. Part 4 drives these from the real OAuth flow. */
export const SPOTIFY_STATUS_COPY: Record<SpotifyConnectionStatus, { tone: StatusTone; label: string; message: string }> = {
  unavailable: {
    tone: "unavailable",
    label: "Not available yet",
    message: "Spotify import isn't switched on in this version. Nothing has been requested from Spotify.",
  },
  not_connected: { tone: "unknown", label: "Not connected", message: "You haven't connected Spotify." },
  connecting: { tone: "in_progress", label: "Connecting", message: "Waiting for Spotify to confirm your permission…" },
  connected: { tone: "confirmed", label: "Connected", message: "Spotify is connected and your artists were imported." },
  partial_import: {
    tone: "unconfirmed",
    label: "Partly imported",
    message: "Some artists were imported. Spotify may not share everyone you listen to — add any missing ones yourself.",
  },
  no_usable_data: {
    tone: "unavailable",
    label: "No artists found",
    message: "Spotify didn't return any followed or top artists for this account. You can add artists manually.",
  },
  permission_denied: {
    tone: "failed",
    label: "Permission denied",
    message: "Spotify didn't grant access, so nothing was imported. You can try again or continue manually.",
  },
  cancelled: { tone: "stale", label: "Cancelled", message: "You cancelled the Spotify sign-in. Nothing was imported." },
  session_expired: {
    tone: "stale",
    label: "Session expired",
    message: "Your Spotify session expired. Reconnect to refresh your artists.",
  },
  temporary_failure: {
    tone: "failed",
    label: "Temporarily unavailable",
    message: "Spotify didn't respond. Your selections are safe — try again in a moment.",
  },
  manual_fallback: {
    tone: "unknown",
    label: "Skipped",
    message: "You chose to add artists manually instead. You can connect Spotify later.",
  },
};
