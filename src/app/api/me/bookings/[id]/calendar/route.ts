import { z } from "zod";
import { bookingOutcomeMessage, getBooking, syncBookingCalendar } from "@/server/bookings";
import { fail, ok } from "@/server/http";
import { rateLimit } from "@/server/guards";
import { meRoute } from "@/server/me";
import { channelPrefsOf, createNotificationRecord, deliverPending } from "@/server/notifications/process";

type Ctx = { params: Promise<{ id: string }> };

/** Retry adding a booking to Google Calendar. Safe to repeat: the calendar event id is deterministic. */
export const POST = meRoute<Ctx>("api/me/bookings/[id]/calendar", async (_req, userId, ctx) => {
  const id = z.string().uuid().safeParse((await ctx.params).id);
  if (!id.success) return fail(404, "not_found", "Booking not found.");
  const limited = await rateLimit(`calendar-retry:${userId}`, 20, 3600);
  if (!limited.allowed) return fail(429, "rate_limited", "Too many retries in a short time. Try again later.");

  const before = await getBooking(userId, id.data);
  if (!before) return fail(404, "not_found", "Booking not found.");
  const booking = await syncBookingCalendar(userId, id.data);
  if (!booking) return fail(404, "not_found", "Booking not found.");

  // When a retry newly succeeds, send one follow-up with the calendar link.
  if (before.calendar.status !== "synced" && booking.calendar.status === "synced" && booking.event) {
    const nid = await createNotificationRecord(
      {
        userId,
        eventId: booking.event.id,
        changeId: null,
        category: "booking_confirmed",
        priority: "normal",
        title: `Added to Google Calendar: ${booking.event.artistNames[0] ?? booking.event.title}`,
        body: [bookingOutcomeMessage("synced"), booking.calendar.htmlLink ? `Google Calendar: ${booking.calendar.htmlLink}` : null]
          .filter(Boolean)
          .join("\n"),
        reason: "You retried adding your booked show to Google Calendar.",
        dedupeKey: `booking:${booking.id}:calendar-synced`,
        snapshot: booking.event,
      },
      await channelPrefsOf(userId),
    ).catch(() => null);
    if (nid) await deliverPending(undefined, 5, nid).catch(() => undefined);
  }
  return ok({ booking, message: bookingOutcomeMessage(booking.calendar.status) });
});
