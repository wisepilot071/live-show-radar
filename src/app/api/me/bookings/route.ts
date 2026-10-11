import { z } from "zod";
import { bookingOutcomeMessage, listBookings, notifyBooking, saveBooking, syncBookingCalendar } from "@/server/bookings";
import { fail, ok, readBody } from "@/server/http";
import { rateLimit } from "@/server/guards";
import { meReadRoute, meRoute } from "@/server/me";

/** The signed-in profile's own bookings (never another profile's). */
export const GET = meReadRoute("api/me/bookings", async (_req, userId) => ok({ bookings: userId ? await listBookings(userId) : [] }));

/**
 * "I've booked my ticket": records a USER-CONFIRMED booking (not verified with
 * any ticket seller), then adds it to Google Calendar if connected, then
 * notifies with the actual result. Idempotent — repeats return the same
 * booking and never re-notify.
 */
export const POST = meRoute("api/me/bookings", async (req, userId) => {
  const body = await readBody(req, z.object({ eventId: z.string().uuid() }));
  if (!body.ok) return body.response;
  const limited = await rateLimit(`bookings:${userId}`, 30, 3600);
  if (!limited.allowed) return fail(429, "rate_limited", "Too many booking changes in a short time. Try again later.");

  const saved = await saveBooking(userId, body.value.eventId);
  if (!saved.ok) return fail(404, "not_found", saved.message);
  if (!saved.created) {
    return ok({ booking: saved.booking, created: false, message: "This show is already in My Bookings." });
  }
  const booking = (await syncBookingCalendar(userId, saved.booking.id)) ?? saved.booking;
  await notifyBooking(userId, booking);
  return ok({ booking, created: true, message: bookingOutcomeMessage(booking.calendar.status) });
});
