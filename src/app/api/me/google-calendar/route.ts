import { ok } from "@/server/http";
import { meReadRoute, meRoute } from "@/server/me";
import { disconnect, getConnection, googleCalendarStatus } from "@/server/google-calendar";

/** Google Calendar connection state for this profile (never tokens). */
export const GET = meReadRoute("api/me/google-calendar", async (_req, userId) => {
  const status = googleCalendarStatus();
  const conn = userId ? await getConnection(userId) : null;
  return ok({
    configured: status.configured,
    reason: status.reason ?? null,
    connection: conn ? { status: conn.status, connectedAt: conn.connected_at.toISOString() } : null,
  });
});

/** Disconnect: revoke at Google (best effort) and delete stored tokens. Bookings stay. */
export const DELETE = meRoute("api/me/google-calendar", async (_req, userId) => ok(await disconnect(userId)));
