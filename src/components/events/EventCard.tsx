"use client";

import { ArrowRight, ArrowUpRight, Bookmark, CalendarDays, MapPin, Ticket } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
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
 * Scan order: artist → where & when → why it matters → tickets → actions.
 *
 * Honesty rules:
 * - unknown values say so ("Date not announced", "Ticket status not verified")
 * - early-bird deadlines appear only when the ticket status is confirmed
 * - a ticket link renders only for a real bookingUrl on non-illustrative data
 * - time-relative tags ("Newly announced", "ends soon") render client-side only
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

  return (
    <article
      aria-labelledby={`ev-${event.id}-title`}
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg border bg-surface transition-colors duration-[var(--duration-base)]",
        isExample ? "border-dashed border-line-strong" : "border-line",
        variant === "deadline" && "border-urgent/50",
        "hover:border-fg-muted",
        className,
      )}
    >
      {/* Poster strip: provenance + the one tag that matters */}
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-line/70 bg-surface-2 px-4 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {isExample && <StatusBadge tone="example" label="Example · not real" />}
          {event.origin === "user_submitted" && <StatusBadge tone="unconfirmed" label="From pasted text" />}
          {tag && <StatusBadge tone={tag.tone} label={tag.label} />}
        </div>
        {saved && (
          <span className="inline-flex items-center gap-1 font-mono text-[0.7rem] tracking-wide text-signal uppercase">
            <Bookmark aria-hidden className="size-3.5 fill-current" /> Saved
          </span>
        )}
      </div>

      <div className={cn("flex flex-1 flex-col gap-4 p-4 sm:p-5", muted && "opacity-75")}>
        {/* 1. Which artist */}
        <header className="min-w-0 space-y-1">
          <p className="font-mono text-xs tracking-wide text-fg-muted uppercase">
            {event.kind === "festival" ? "Festival" : event.kind === "tour_stop" ? "Tour stop" : "Concert"}
          </p>
          <h3
            id={`ev-${event.id}-title`}
            className={cn(
              "font-display text-2xl leading-tight font-bold tracking-tight break-words text-fg",
              signals?.cancelled && "line-through decoration-urgent/70",
            )}
          >
            {event.artistNames.join(", ")}
          </h3>
          <p className="text-sm break-words text-fg-secondary">{event.title}</p>
        </header>

        {/* 2. Where and when */}
        <dl className="grid gap-2 text-sm">
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">Venue and city</dt>
            <MapPin aria-hidden className={cn("mt-0.5 size-4 shrink-0", isPrimary ? "text-signal" : "text-fg-muted")} />
            <dd className="min-w-0 break-words text-fg">
              {event.venueName ?? <span className="text-fg-muted italic">Venue not announced</span>}
              <span className="text-fg-secondary"> · {event.cityName}</span>
            </dd>
          </div>
          <div className="flex items-start gap-2.5">
            <dt className="sr-only">Date</dt>
            <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <dd className={event.when.date || event.when.startsAt ? "text-fg" : "text-fg-muted italic"}>
              {formatEventDate(event.when)}
            </dd>
          </div>
        </dl>

        {/* 3. Why it is relevant */}
        {location && signals && (
          <p className={cn("text-sm", isPrimary ? "font-medium text-signal" : "text-fg-secondary")}>
            {relevanceLine(event, signals, location.primaryCityId)}
          </p>
        )}

        {/* 4. Tickets */}
        <div
          className={cn(
            "space-y-2 rounded-md border bg-inset p-3",
            variant === "deadline" ? "border-urgent/40" : "border-line/70",
          )}
        >
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
            <p className={cn("text-sm", variant === "deadline" ? "font-semibold text-urgent" : "text-fg")}>
              Early-bird ends {formatTimestamp(ticket.earlyBirdEndsAt, event.when.timeZone)}
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
        <footer className="mt-auto space-y-3 border-t border-line/60 pt-3">
          <p className="text-xs text-fg-muted">
            Source: <span className="text-fg-secondary">{event.source.name}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {detailHref && (
              <Link
                href={detailHref}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line-strong px-3 text-sm font-semibold text-fg transition-colors hover:border-fg-muted hover:bg-surface-2"
              >
                Details
                <ArrowRight aria-hidden className="size-4" />
                <span className="sr-only">for {event.artistNames[0]} in {event.cityName}</span>
              </Link>
            )}
            {actions}
            {canBook && ticket.bookingUrl ? (
              <a
                href={ticket.bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-signal hover:underline"
              >
                Ticket page on {hostLabel(ticket.bookingUrl)}
                <ArrowUpRight aria-hidden className="size-4" />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              <p className="ml-auto text-xs font-medium text-fg-muted">
                {isExample ? "No ticket link — example" : "No verified ticket link"}
              </p>
            )}
          </div>
        </footer>
      </div>
    </article>
  );
}
