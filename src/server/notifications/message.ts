import type { LiveEvent } from "@/domain/types";
import { formatEventDate, formatTimestamp } from "@/lib/format";

/**
 * Plain-text message for email and Telegram, built only from the stored
 * notification and its event snapshot. Fields that aren't known are left out
 * (never guessed); ticket facts appear only when the source confirmed them.
 */
export interface NotificationForMessage {
  category: string;
  title: string;
  body: string;
  reason: string;
  event: LiveEvent | null;
}

const TICKET_LABEL: Record<string, string> = {
  announced_not_on_sale: "Announced, not on sale yet",
  presale: "Presale",
  early_bird: "Early-bird tickets",
  on_sale: "Tickets on sale",
  limited: "Limited availability",
  sold_out: "Sold out",
  cancelled: "Cancelled",
  postponed: "Rescheduled",
};

export function eventLines(event: LiveEvent): string[] {
  const lines: string[] = [];
  lines.push(`${event.artistNames.join(", ")} — ${event.title}`);
  lines.push(`When: ${formatEventDate(event.when)}${event.when.startsAt ? "" : " (time not announced)"}`);
  lines.push(`Where: ${event.venueName ? `${event.venueName}, ` : ""}${event.cityName}`);
  const t = event.ticket;
  if (t.verification.state === "confirmed" && t.kind !== "unknown") {
    lines.push(`Tickets: ${TICKET_LABEL[t.kind] ?? t.kind} (confirmed by ${event.source.name})`);
    if (t.kind === "early_bird" && t.earlyBirdEndsAt) lines.push(`Early bird ends: ${formatTimestamp(t.earlyBirdEndsAt, event.when.timeZone)}`);
    if (t.saleOpensAt) lines.push(`General sale opens: ${formatTimestamp(t.saleOpensAt, event.when.timeZone)}`);
  } else {
    lines.push("Tickets: status not confirmed by a source yet");
  }
  if (t.bookingUrl && /^https?:\/\//.test(t.bookingUrl)) lines.push(`Official ticket link: ${t.bookingUrl}`);
  lines.push(`Source: ${event.source.name}`);
  return lines;
}

export function renderNotification(n: NotificationForMessage, appBaseUrl?: string): { subject: string; text: string } {
  const parts: string[] = [n.title, ""];
  if (n.body) parts.push(n.body, "");
  if (n.event && n.category !== "booking_confirmed") parts.push(...eventLines(n.event), "");
  if (appBaseUrl && n.event) {
    parts.push(
      n.category === "booking_confirmed"
        ? `My bookings: ${appBaseUrl}/bookings`
        : `On Live Show Radar: ${appBaseUrl}/radar/events/${encodeURIComponent(n.event.id)}`,
    );
  }
  parts.push(`Why you're getting this: ${n.reason}`, "", "— Live Show Radar");
  return { subject: n.title.slice(0, 200), text: parts.join("\n") };
}
