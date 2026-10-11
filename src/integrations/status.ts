import type { NotificationChannelKind, NotificationChannelStatus } from "@/domain/types";
import type { SpotifyAvailability } from "./spotify/contract";

/**
 * Public, secret-free summary of what is wired up on this server.
 * "configured" (a key/URL is present) is always reported separately from
 * "last success" (a real request actually worked).
 */
export interface IntegrationStatusReport {
  checkedAt: string;
  spotify: SpotifyAvailability;
  artistSearch: { source: "sample_catalogue" | "live"; label: string };
  database: { configured: boolean; reachable: boolean | null };
  persistence: { kind: "browser_draft" | "server"; label: string };
  eventSources: {
    /** Back-compat: configured sources (Part 2 UI reads this). */
    connected: Array<{ id: string; name: string }>;
    all: Array<{
      id: string;
      name: string;
      configured: boolean;
      reason?: string;
      lastRun?: { status: string; at: string; errorCategory?: string };
      lastSuccessAt?: string;
    }>;
  };
  gemini: { configured: boolean; model: string; fallbackModel?: string; lastSuccessAt?: string; lastFailureAt?: string };
  notifications: Record<NotificationChannelKind, NotificationChannelStatus>;
  /** Why email isn't available (null when it is). */
  emailReason: string | null;
  /** Why Telegram isn't available (null when the bot is configured). */
  telegramReason: string | null;
  /** Google Calendar OAuth client (per-user connection is separate). */
  googleCalendar: { configured: boolean; reason: string | null };
  /** Event sources requested but not integrated, with the reason (never shown as working). */
  unavailableSources: Array<{ id: string; name: string; reason: string }>;
  /** Scheduled monitoring: configured ≠ running. lastRun is the last real execution. */
  scheduler: {
    configured: boolean;
    cadence: string;
    lastRun?: { at: string; status: string; trigger: string };
    lastSuccessAt?: string;
  };
}
