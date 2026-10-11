"use client";

import { ArrowRight, ArrowUpRight, CalendarCheck2, CalendarX2, Clock, MapPin, RotateCw, Ticket, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useBookings, type CalendarStatus, type ClientBooking } from "@/features/bookings/BookingsProvider";
import { formatEventDate, formatTimestamp, hostLabel } from "@/lib/format";
import { RowListSkeleton } from "@/components/ui/Skeletons";

const CALENDAR: Record<CalendarStatus, { tone: StatusTone; label: string; detail: string }> = {
  synced: { tone: "confirmed", label: "In Google Calendar", detail: "Added to your Google Calendar." },
  pending: { tone: "in_progress", label: "Adding to calendar", detail: "Google Calendar sync is in progress." },
  failed: { tone: "failed", label: "Calendar sync failed", detail: "Couldn't add it to Google Calendar. You can retry." },
  needs_reauth: { tone: "unconfirmed", label: "Reconnect calendar", detail: "Google Calendar needs to be reconnected in Settings." },
  not_connected: { tone: "unavailable", label: "Calendar not connected", detail: "Connect Google Calendar in Settings to add bookings automatically." },
};

/** My Bookings: only this profile's bookings, straight from the server (no samples). */
export function MyBookings() {
  const { phase, bookings, error, reload } = useBookings();
  return (
    <Container width="wide" className="space-y-8 py-8 sm:py-12">
      <PageHeader
        atmosphere="festival-sunset"
        eyebrow="My bookings"
        title="Shows you've booked."
        description="Bookings you've recorded after buying tickets on the seller's site. We can't see or verify purchases — these are confirmed by you."
      />

      {phase === "loading" && <RowListSkeleton label="Loading your bookings…" count={3} />}
      {phase === "storage_off" && (
        <InlineAlert tone="info" title="Bookings need server storage">
          This server&rsquo;s database isn&rsquo;t configured or reachable, so bookings can&rsquo;t be saved here.
        </InlineAlert>
      )}
      {phase === "error" && (
        <InlineAlert tone="error" title="Couldn't load your bookings" action={<Button variant="secondary" onClick={reload}>Try again</Button>}>
          {error}
        </InlineAlert>
      )}
      {phase === "ready" && bookings.length === 0 && (
        <EmptyState doodle="ticket" icon={Ticket} title="No bookings yet" action={<ButtonLink href="/radar">Find a show</ButtonLink>}>
          After you buy a ticket on the seller&rsquo;s site, come back and press &ldquo;I&rsquo;ve booked my ticket&rdquo; on the show.
          It&rsquo;ll appear here and, if connected, in your Google Calendar.
        </EmptyState>
      )}
      {phase === "ready" && bookings.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2" aria-label="Bookings">
          {bookings.map((b) => (
            <li key={b.id}>
              <BookingCard booking={b} />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}

function BookingCard({ booking }: { booking: ClientBooking }) {
  const { retryCalendar, remove } = useBookings();
  const toast = useToast();
  const [busy, setBusy] = useState<"retry" | "remove" | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const e = booking.event;
  const cal = CALENDAR[booking.calendar.status];
  const canRetry = booking.calendar.status === "failed" || booking.calendar.status === "pending";

  async function retry() {
    setBusy("retry");
    const r = await retryCalendar(booking.id);
    setBusy(null);
    toast({ message: r.message, tone: r.ok && r.booking?.calendar.status === "synced" ? "success" : "info" });
  }
  async function doRemove() {
    setBusy("remove");
    const r = await remove(booking.id);
    setBusy(null);
    setConfirmRemove(false);
    toast({ message: r.message, tone: r.ok ? "success" : "info" });
  }

  return (
    <article className="flex h-full flex-col gap-4 rounded-xl border border-line bg-surface shadow-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="completed" label={booking.status === "provider_verified" ? "Verified by seller" : "Booked · confirmed by you"} />
        <StatusBadge tone={cal.tone} label={cal.label} />
      </div>
      <div className="space-y-1">
        <h2 className="font-display text-2xl leading-tight font-semibold">{e ? e.artistNames.join(", ") : "Show no longer available"}</h2>
        {e && <p className="text-sm text-fg-secondary">{e.title}</p>}
      </div>
      {e && (
        <dl className="grid gap-1.5 text-sm">
          <div className="flex gap-2.5">
            <dt className="sr-only">Date</dt>
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <dd>{formatEventDate(e.when)}</dd>
          </div>
          <div className="flex gap-2.5">
            <dt className="sr-only">Venue</dt>
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
            <dd>
              {e.venueName ?? "Venue not announced"} · <span className="font-semibold">{e.cityName}</span>
            </dd>
          </div>
        </dl>
      )}
      <div className="space-y-1 rounded-lg bg-surface-2/70 p-3 text-sm">
        <p className="flex items-center gap-2 font-semibold">
          {booking.calendar.status === "synced" ? <CalendarCheck2 aria-hidden className="size-4" /> : <CalendarX2 aria-hidden className="size-4" />}
          {cal.detail}
        </p>
        {booking.calendar.error && booking.calendar.status !== "synced" && <p className="text-xs text-fg-muted">Last error: {booking.calendar.error}</p>}
        <p className="text-xs text-fg-muted">Recorded {formatTimestamp(booking.confirmedAt)}</p>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {booking.calendar.htmlLink && (
          <a
            href={booking.calendar.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-signal px-4 text-sm font-semibold text-on-signal hover:bg-signal-hover"
          >
            Open in Google Calendar <ArrowUpRight aria-hidden className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        {canRetry && (
          <Button variant="secondary" onClick={() => void retry()} loading={busy === "retry"} leadingIcon={<RotateCw aria-hidden className="size-4" />}>
            Retry calendar
          </Button>
        )}
        {(booking.calendar.status === "not_connected" || booking.calendar.status === "needs_reauth") && (
          <ButtonLink href="/settings#connections" variant="secondary">
            {booking.calendar.status === "needs_reauth" ? "Reconnect Google Calendar" : "Connect Google Calendar"}
          </ButtonLink>
        )}
        {e?.ticket.bookingUrl && (
          <a href={e.ticket.bookingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold text-signal-ink hover:underline">
            Ticket page on {hostLabel(e.ticket.bookingUrl)} <ArrowUpRight aria-hidden className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
        {e && (
          <Link href={`/radar/events/${encodeURIComponent(e.id)}`} className="inline-flex min-h-11 items-center gap-1 px-2 text-sm font-semibold hover:underline">
            Details <ArrowRight aria-hidden className="size-4" />
          </Link>
        )}
        <Button variant="ghost" className="ml-auto" onClick={() => setConfirmRemove(true)} leadingIcon={<Trash2 aria-hidden className="size-4" />}>
          Remove
        </Button>
      </div>
      <Dialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove this booking?"
        description="Use this if you recorded it by mistake. It also removes the Google Calendar event we added, when possible. Your ticket itself isn't affected."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Keep it
            </Button>
            <Button variant="secondary" onClick={() => void doRemove()} loading={busy === "remove"}>
              Remove booking
            </Button>
          </>
        }
      />
    </article>
  );
}
