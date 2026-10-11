import { getServerEnv } from "@/config/server-env";
import type { LiveEvent } from "@/domain/types";
import { buildCalendarEvent, deleteCalendarEvent, upsertCalendarEvent } from "@/integrations/google/calendar";
import { getSql } from "@/server/db";
import { accessTokenFor } from "@/server/google-calendar";
import { errorMessage, log } from "@/server/log";
import { channelPrefsOf, createNotificationRecord, deliverPending } from "@/server/notifications/process";
import { getEventById } from "@/server/repos/events";
import { formatEventDate } from "@/lib/format";

/**
 * Explicit booking confirmations.
 *
 * A booking exists only because the user pressed "I've booked my ticket" for
 * an event they can see. Its status is "user_confirmed" — the ticket purchase
 * is NOT verified with any seller (no authorised ticketing API exists here).
 * Order of operations (each step's failure leaves earlier steps intact):
 *   1. save the booking (idempotent: unique per user+event)
 *   2. add it to Google Calendar if connected (idempotent: deterministic id)
 *   3. notify by in-app/email/Telegram with the ACTUAL calendar outcome
 *      (idempotent: one notification per booking)
 */
export type CalendarStatus = "not_connected" | "pending" | "synced" | "failed" | "needs_reauth";

export interface Booking {
  id: string;
  eventId: string;
  status: "user_confirmed" | "provider_verified";
  confirmedAt: string;
  calendar: { status: CalendarStatus; htmlLink: string | null; error: string | null; syncedAt: string | null; attempts: number };
  event: LiveEvent | null;
}

interface BookingRow {
  id: string;
  event_id: string;
  status: Booking["status"];
  confirmed_at: Date;
  calendar_status: CalendarStatus;
  calendar_event_id: string | null;
  calendar_html_link: string | null;
  calendar_error: string | null;
  calendar_attempts: number;
  calendar_synced_at: Date | null;
}

function toBooking(r: BookingRow, event: LiveEvent | null): Booking {
  return {
    id: r.id,
    eventId: r.event_id,
    status: r.status,
    confirmedAt: r.confirmed_at.toISOString(),
    calendar: {
      status: r.calendar_status,
      htmlLink: r.calendar_html_link,
      error: r.calendar_error,
      syncedAt: r.calendar_synced_at?.toISOString() ?? null,
      attempts: r.calendar_attempts,
    },
    event,
  };
}

async function bookingRow(userId: string, bookingId: string): Promise<BookingRow | null> {
  const [row] = await getSql()<BookingRow[]>`select * from radar.bookings where id = ${bookingId} and user_id = ${userId}`;
  return row ?? null;
}

export async function listBookings(userId: string): Promise<Booking[]> {
  const rows = await getSql()<BookingRow[]>`select * from radar.bookings where user_id = ${userId} order by confirmed_at desc`;
  return Promise.all(rows.map(async (r) => toBooking(r, await getEventById(r.event_id, userId))));
}

export async function getBooking(userId: string, bookingId: string): Promise<Booking | null> {
  const r = await bookingRow(userId, bookingId);
  return r ? toBooking(r, await getEventById(r.event_id, userId)) : null;
}

export type ConfirmResult =
  | { ok: true; created: boolean; booking: Booking }
  | { ok: false; code: "not_found"; message: string };

/** Step 1. Idempotent: confirming the same event twice returns the existing booking. */
export async function saveBooking(userId: string, eventId: string): Promise<ConfirmResult> {
  const event = await getEventById(eventId, userId);
  if (!event) return { ok: false, code: "not_found", message: "That show isn't on your radar (or no longer exists)." };
  const sql = getSql();
  const [inserted] = await sql<BookingRow[]>`
    insert into radar.bookings (user_id, event_id) values (${userId}, ${eventId})
    on conflict (user_id, event_id) do nothing
    returning *`;
  const row = inserted ?? (await sql<BookingRow[]>`select * from radar.bookings where user_id = ${userId} and event_id = ${eventId}`)[0];
  if (!row) throw new Error("booking row missing after insert");
  return { ok: true, created: Boolean(inserted), booking: toBooking(row, event) };
}

/** Step 2. Adds the booking to Google Calendar if connected. Never deletes or changes the booking itself. */
export async function syncBookingCalendar(userId: string, bookingId: string, now = new Date()): Promise<Booking | null> {
  const sql = getSql();
  const row = await bookingRow(userId, bookingId);
  if (!row) return null;
  const event = await getEventById(row.event_id, userId, now);
  if (row.calendar_status === "synced") return toBooking(row, event);

  const token = await accessTokenFor(userId, now);
  const update = async (status: CalendarStatus, fields: { id?: string | null; link?: string | null; error?: string | null; attempted: boolean }) => {
    const [r] = await sql<BookingRow[]>`
      update radar.bookings set calendar_status = ${status},
        calendar_event_id = coalesce(${fields.id ?? null}, calendar_event_id),
        calendar_html_link = coalesce(${fields.link ?? null}, calendar_html_link),
        calendar_error = ${fields.error ?? null},
        calendar_attempts = calendar_attempts + ${fields.attempted ? 1 : 0},
        calendar_synced_at = ${status === "synced" ? now : null},
        updated_at = now()
      where id = ${bookingId} and user_id = ${userId}
      returning *`;
    return toBooking(r ?? row, event);
  };

  if (!token.ok) {
    if (token.reason === "not_connected" || token.reason === "not_configured") return update("not_connected", { attempted: false });
    if (token.reason === "needs_reauth") return update("needs_reauth", { error: token.error ?? "Reconnect Google Calendar", attempted: false });
    return update("failed", { error: token.error ?? "Google Calendar is temporarily unavailable", attempted: true });
  }
  if (!event) return update("failed", { error: "The show is no longer available", attempted: true });
  const built = buildCalendarEvent(event, bookingId, getServerEnv().appBaseUrl);
  if (!built.ok) return update("failed", { error: built.reason, attempted: true });

  await sql`update radar.bookings set calendar_status = 'pending', updated_at = now() where id = ${bookingId} and user_id = ${userId}`;
  const r = await upsertCalendarEvent(token.token, built.body);
  if (r.ok) return update("synced", { id: r.value.id, link: r.value.htmlLink, attempted: true });
  if (r.kind === "auth") {
    await sql`update radar.google_calendar_connections set status = 'needs_reauth', updated_at = now() where user_id = ${userId}`;
    return update("needs_reauth", { error: r.error, attempted: true });
  }
  log.warn("bookings", "calendar sync failed", { status: r.status, kind: r.kind });
  return update("failed", { error: r.error, attempted: true });
}

export function bookingOutcomeMessage(calendar: CalendarStatus): string {
  switch (calendar) {
    case "synced":
      return "Your booking has been recorded, and the concert has been added to Google Calendar.";
    case "failed":
      return "Your booking has been recorded, but Google Calendar synchronisation failed. You can retry from My Bookings.";
    case "needs_reauth":
      return "Your booking has been recorded, but Google Calendar needs to be reconnected before the concert can be added.";
    case "pending":
      return "Your booking has been recorded. Adding it to Google Calendar is still in progress.";
    default:
      return "Your booking has been recorded. Connect Google Calendar to add the concert to your calendar.";
  }
}

/** Step 3. One notification per booking, written AFTER the calendar result is known. */
export async function notifyBooking(userId: string, booking: Booking): Promise<void> {
  if (!booking.event) return;
  const e = booking.event;
  const lines = [
    bookingOutcomeMessage(booking.calendar.status),
    `${e.artistNames.join(", ")} — ${e.title}`,
    `${formatEventDate(e.when)} · ${e.venueName ? `${e.venueName}, ` : ""}${e.cityName}`,
    "Status: confirmed by you (not verified with the ticket seller).",
    booking.calendar.htmlLink ? `Google Calendar: ${booking.calendar.htmlLink}` : null,
  ].filter(Boolean);
  try {
    const id = await createNotificationRecord(
      {
        userId,
        eventId: e.id,
        changeId: null,
        category: "booking_confirmed",
        priority: "normal",
        title: `Booking recorded: ${e.artistNames[0] ?? e.title}`,
        body: lines.join("\n"),
        reason: "You confirmed you booked a ticket for this show in Live Show Radar.",
        dedupeKey: `booking:${booking.id}`,
        snapshot: e,
      },
      await channelPrefsOf(userId),
    );
    if (id) await deliverPending(undefined, 5, id);
  } catch (err) {
    // A notification failure never affects the saved booking or calendar state.
    log.error("bookings", "booking notification failed", { error: errorMessage(err) });
  }
}

/** Removes a booking the user recorded by mistake; removes its calendar event too when possible. */
export async function deleteBooking(userId: string, bookingId: string): Promise<{ deleted: boolean; calendarRemoved: boolean | null }> {
  const row = await bookingRow(userId, bookingId);
  if (!row) return { deleted: false, calendarRemoved: null };
  let calendarRemoved: boolean | null = null;
  if (row.calendar_event_id) {
    const token = await accessTokenFor(userId);
    if (token.ok) {
      const r = await deleteCalendarEvent(token.token, row.calendar_event_id);
      calendarRemoved = r.ok;
    } else {
      calendarRemoved = false;
    }
  }
  await getSql()`delete from radar.bookings where id = ${bookingId} and user_id = ${userId}`;
  return { deleted: true, calendarRemoved };
}
