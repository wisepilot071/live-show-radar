import type { NotificationChannelKind } from "@/domain/types";

/**
 * Client-safe channel descriptors. Real availability is computed on the
 * server (src/app/api/integrations/status/route.ts, src/server/notifications/
 * channels.ts) and reported through /api/integrations/status and
 * /api/me/channels — a channel is only "active" when delivery is implemented,
 * configured on this server, and (for external channels) set up by the user.
 */
export interface ChannelDescriptor {
  kind: NotificationChannelKind;
  label: string;
  description: string;
}

export const CHANNEL_DESCRIPTORS: readonly ChannelDescriptor[] = [
  {
    kind: "in_app",
    label: "In-app inbox",
    description: "Alerts appear in your Inbox in the app, with the reason for each one.",
  },
  { kind: "email", label: "Email", description: "A short email when something important changes." },
  { kind: "telegram", label: "Telegram", description: "A Telegram message for time-sensitive changes." },
];
