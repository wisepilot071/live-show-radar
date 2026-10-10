import type { StatusTone } from "@/components/ui/StatusBadge";
import type { EventSignals } from "@/domain/event-signals";
import type { LiveEvent, TicketStatusKind, VerificationState } from "@/domain/types";
import { cityLabel } from "@/domain/cities";

export const TICKET_STATUS_LABEL: Record<TicketStatusKind, string> = {
  unknown: "Ticket status not verified",
  announced_not_on_sale: "Announced · not on sale yet",
  presale: "Presale",
  early_bird: "Early-bird tickets",
  on_sale: "General tickets on sale",
  limited: "Limited availability",
  sold_out: "Sold out",
  cancelled: "Cancelled",
  postponed: "Rescheduled",
};

export const VERIFICATION_TONE: Record<VerificationState, StatusTone> = {
  confirmed: "confirmed",
  unconfirmed: "unconfirmed",
  stale: "stale",
  pending: "pending",
  unavailable: "unavailable",
};

export const VERIFICATION_EXPLAINER: Record<VerificationState, string> = {
  confirmed: "Checked against a supported source recently.",
  unconfirmed: "Seen somewhere, but no supported source confirms it yet.",
  stale: "Was confirmed, but hasn't been re-checked recently. Details may have changed.",
  pending: "A check is queued or running.",
  unavailable: "No supported source can provide this right now.",
};

/**
 * The one headline tag a card shows, in priority order. Only data-backed
 * signals produce a tag; an ordinary confirmed event gets none.
 */
export type CardVariant = "cancelled" | "rescheduled" | "deadline" | "new" | "early_bird" | "unverified" | "standard";

export function cardVariant(signals: EventSignals): CardVariant {
  if (signals.cancelled) return "cancelled";
  if (signals.postponed) return "rescheduled";
  if (signals.deadlineApproaching) return "deadline";
  if (signals.isNew) return "new";
  if (signals.earlyBirdOpen) return "early_bird";
  if (signals.needsVerification) return "unverified";
  return "standard";
}

export const VARIANT_TAG: Record<Exclude<CardVariant, "standard">, { tone: StatusTone; label: string }> = {
  cancelled: { tone: "failed", label: "Cancelled" },
  rescheduled: { tone: "unconfirmed", label: "Date or venue changed" },
  deadline: { tone: "urgent", label: "Early-bird ends soon" },
  new: { tone: "confirmed", label: "Newly announced" },
  early_bird: { tone: "confirmed", label: "Early-bird open" },
  unverified: { tone: "unconfirmed", label: "Needs verification" },
};

/** Why this show is on the user's radar, in plain words. */
export function relevanceLine(event: LiveEvent, signals: EventSignals | null, primaryCityId?: string): string {
  if (!signals || !primaryCityId) return event.cityName;
  if (signals.locality === "primary") return `In ${event.cityName} — your city`;
  if (signals.locality === "additional") return `In ${event.cityName} — a city you prioritised`;
  return `In ${event.cityName} — elsewhere in India, ranked after ${cityLabel(primaryCityId).split(",")[0]}`;
}
