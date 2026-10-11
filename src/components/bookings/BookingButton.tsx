"use client";

import { CalendarCheck2, Ticket } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import type { LiveEvent } from "@/domain/types";
import { useBookings } from "@/features/bookings/BookingsProvider";
import { BookingReach } from "./BookingReach";
import { formatEventDate } from "@/lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only real, stored events can be booked — never examples. */
export function isBookable(event: LiveEvent): boolean {
  return event.origin !== "illustrative" && UUID.test(event.id);
}

/**
 * "I've booked my ticket". Opening a ticket link never books anything: this
 * explicit confirmation does. The dialog states plainly that the purchase
 * isn't verified with the seller. Double clicks are harmless (button locks;
 * the server is idempotent anyway).
 */
export function BookingButton({ event }: { event: LiveEvent }) {
  const { phase, byEventId, confirm } = useBookings();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isBookable(event) || phase === "storage_off") return null;
  const booking = byEventId.get(event.id);

  if (booking) {
    return (
      <Link
        href="/bookings"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-on-ink hover:bg-ink/90"
      >
        <CalendarCheck2 aria-hidden className="size-4" />
        Booked
        <span className="sr-only"> (confirmed by you) — open My Bookings</span>
      </Link>
    );
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await confirm(event.id);
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setOpen(false);
    toast({ message: r.message, tone: r.booking?.calendar.status === "failed" ? "info" : "success" });
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={phase === "loading"} leadingIcon={<Ticket aria-hidden className="size-4" />}>
        I&rsquo;ve booked my ticket
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Record this booking?"
        description={`${event.artistNames.join(", ")} · ${formatEventDate(event.when)} · ${event.venueName ? `${event.venueName}, ` : ""}${event.cityName}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Not yet
            </Button>
            <Button onClick={() => void submit()} loading={busy}>
              Yes, I&rsquo;ve booked it
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-fg-secondary">
          <p>
            Only confirm after you&rsquo;ve bought a ticket on the seller&rsquo;s site. We&rsquo;ll add it to My Bookings
            {" "}and, if it&rsquo;s connected, to your Google Calendar — then send you a confirmation.
          </p>
          {open && <BookingReach />}
          <p className="text-xs text-fg-muted">
            This records your own confirmation. Live Show Radar can&rsquo;t see or verify ticket purchases.
          </p>
          {error && (
            <p role="alert" className="font-medium text-urgent-ink">
              {error}
            </p>
          )}
        </div>
      </Dialog>
    </>
  );
}
