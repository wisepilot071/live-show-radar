"use client";

import { ArrowRight, ArrowUpRight, Bookmark, Clock, MapPin, Ticket } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EventMedia } from "./EventMedia";
import { deriveEventSignals } from "@/domain/event-signals";
import type { LiveEvent, LocationPreference } from "@/domain/types";
import { cn } from "@/lib/cn";
import { formatEventDate, formatTimestamp, hostLabel } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import {
  cardVariant,
  relevanceLine,
  TICKET_STATUS_LABEL,
  VARIANT_TAG,
  VERIFICATION_EXPLAINER,
  VERIFICATION_TONE,
} from "./event-labels";

/**
 * The one event card used everywhere (landing, explore, radar, saved).
 * Scan order: date tile → artist → where & when → why it matters → tickets → actions.
 *
 * Honesty rules:
 * - unknown values say so ("Date not announced", "Awaiting ticket information")
 * - early-bird deadlines appear only when the ticket status is confirmed
 * - a ticket link renders only for a real bookingUrl on non-illustrative data
 * - time-relative tags ("Just announced", "ends soon") render client-side only
 * - imagery is the headliner's real licensed photo (credited) or clearly abstract
 *   doodle art — never a fake event poster; the date stays visible as a chip
 */
export function EventCard({
  event,
  location,
  detailHref,
  saved,
  actions,
  className,
}: {
  event: LiveEvent;
  /** Enables locality ("your city") and ranking context. */
  location?: LocationPreference;
  detailHref?: string;
  saved?: boolean;
  /** Slot for a save button (needs the radar state provider). */
  actions?: ReactNode;
  className?: string;
}) {
  const now = useNow();
  const signals = now ? deriveEventSignals(event, now, location) : null;
  const variant = signals ? cardVariant(signals) : "standard";
  const tag = variant !== "standard" ? VARIANT_TAG[variant] : null;
  const isExample = event.origin === "illustrative";
  const ticket = event.ticket;
  const ticketConfirmed = ticket.verification.state === "confirmed";
  const canBook = !isExample && Boolean(ticket.bookingUrl);
  const isPrimary = signals?.locality === "primary";
  const muted = signals?.cancelled || signals?.isPast;
  const urgent = variant === "deadline";

  return (
    <article
      aria-labelledby={`ev-${event.id}-title`}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border-2 bg-surface shadow-card transition-[border-color,box-shadow,transform] duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
        // Border colour carries meaning: coral = confirmed deadline, lime = your city,
        // amber = ticket info not verified, sky = everything else; examples stay dashed.
        isExample
          ? "border-dashed border-line-strong"
          : urgent
            ? "border-urgent/70"
            : isPrimary
              ? "border-signal-ink/45"
              : ticket.verification.state === "confirmed"
                ? "border-[#8ec5ff]/70"
                : "border-warning/35",
        "hover:-translate-y-0.5 hover:shadow-card-hover motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      <EventMedia event={event} urgent={urgent} />
      <div className={cn("flex flex-1 flex-col gap-4 p-4 sm:p-5", muted && "opacity-75")}>
        {/* 1. When + which artist */}
        <header className="flex min-w-0 gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {isExample && <StatusBadge tone="example" label="Example · not real" />}
              {event.origin === "user_submitted" && <StatusBadge tone="unconfirmed" label="From pasted text" />}
              {tag && <StatusBadge tone={tag.tone} label={tag.label} />}
              {saved && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-signal-ink">
                  <Bookmark aria-hidden className="size-3.5 fill-current" /> Saved
                </span>
              )}
            </div>
            <h3
              id={`ev-${event.id}-title`}
              className={cn(
                "font-display text-[1.45rem] leading-tight font-semibold break-words text-fg",
                signals?.cancelled && "line-through decoration-urgent/70",
              )}
            >
              {event.artistNames.join(", ")}
            </h3>
            <p className="text-sm break-words text-fg-secondary">
              {event.kind === "festival" ? "Festival" : event.kind === "tour_stop" ? "Tour stop" : "Concert"} · {event.title}
            </p>
          </div>
        </header>

        {/* 2. Where and when */}
        <dl className="grid gap-1.5 text-sm">
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">Venue and city</dt>
            <MapPin aria-hidden className={cn("mt-0.5 size-4 shrink-0", isPrimary ? "text-signal-ink" : "text-fg-muted")} />
            <dd className="min-w-0 break-words text-fg">
              {event.venueName ?? <span className="text-fg-muted italic">Venue not announced</span>}
              <span className="font-semibold"> · {event.cityName}</span>
            </dd>
          </div>
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">Date and time</dt>
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <dd className={event.when.date || event.when.startsAt ? "text-fg" : "text-fg-muted italic"}>
              {formatEventDate(event.when)}
            </dd>
          </div>
        </dl>

        {/* 3. Why it is relevant */}
        {location && signals && (
          <p className={cn("text-sm", isPrimary ? "font-semibold text-signal-ink" : "text-fg-secondary")}>
            {relevanceLine(event, signals, location.primaryCityId)}
          </p>
        )}

        {/* 4. Tickets */}
        <div className={cn("space-y-1.5 rounded-lg p-3 shadow-[inset_0_1px_2px_rgb(32_40_32/0.06)]", urgent ? "bg-urgent/10" : "bg-surface-2/70")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Ticket aria-hidden className="size-4 shrink-0 text-fg-muted" />
              {ticket.verification.state === "unavailable"
                ? "Ticket source couldn't be checked"
                : ticketConfirmed || ticket.kind === "unknown"
                  ? TICKET_STATUS_LABEL[ticket.kind]
                  : `${TICKET_STATUS_LABEL[ticket.kind]} (not verified)`}
            </p>
            <StatusBadge tone={VERIFICATION_TONE[ticket.verification.state]} />
          </div>
          {ticketConfirmed && ticket.earlyBirdEndsAt && ticket.kind === "early_bird" && (
            <p className={cn("text-sm", urgent ? "font-semibold text-urgent-ink" : "text-fg")}>
              Early bird ends {formatTimestamp(ticket.earlyBirdEndsAt, event.when.timeZone)}
            </p>
          )}
          {ticketConfirmed && ticket.saleOpensAt && (
            <p className="text-sm text-fg">General sale opens {formatTimestamp(ticket.saleOpensAt, event.when.timeZone)}</p>
          )}
          <p className="text-xs text-fg-muted">
            {ticket.verification.note ?? VERIFICATION_EXPLAINER[ticket.verification.state]}
            {ticket.verification.lastVerifiedAt && (
              <> Last verified {formatTimestamp(ticket.verification.lastVerifiedAt, event.when.timeZone)}.</>
            )}
          </p>
        </div>

        {/* 5. What next */}
        <footer className="mt-auto space-y-3 border-t border-line pt-3">
          <p className="text-xs text-fg-muted">
            Source: <span className="font-medium text-fg-secondary">{event.source.name}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {canBook && ticket.bookingUrl && (
              <a
                href={ticket.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-signal px-4 text-sm font-semibold text-on-signal transition-colors hover:bg-signal-hover"
              >
                Get tickets on {hostLabel(ticket.bookingUrl)}
                <ArrowUpRight aria-hidden className="size-4" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            {detailHref && (
              <Link
                href={detailHref}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line-strong px-4 text-sm font-semibold text-fg transition-colors hover:border-fg"
              >
                Details
                <ArrowRight aria-hidden className="size-4" />
                <span className="sr-only">
                  for {event.artistNames[0]} in {event.cityName}
                </span>
              </Link>
            )}
            {actions}
            {!canBook && (
              <p className="ml-auto text-xs font-medium text-fg-muted">
                {isExample ? "No ticket link — example" : "No verified ticket link yet"}
              </p>
            )}
          </div>
        </footer>
      </div>
    </article>
  );
}
