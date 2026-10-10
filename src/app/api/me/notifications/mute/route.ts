import { z } from "zod";
import { getSql } from "@/server/db";
import { fail, ok, readBody } from "@/server/http";
import { meRoute } from "@/server/me";

/** Mute or unmute future notifications about one event. */
export const POST = meRoute("api/me/notifications/mute", async (req, userId) => {
  const body = await readBody(req, z.object({ eventId: z.string().uuid(), muted: z.boolean() }));
  if (!body.ok) return body.response;
  const sql = getSql();
  if (body.value.muted) {
    const [exists] = await sql`select 1 from radar.events where id = ${body.value.eventId}`;
    if (!exists) return fail(404, "not_found", "That show doesn't exist.");
    await sql`insert into radar.event_mutes (user_id, event_id) values (${userId}, ${body.value.eventId}) on conflict do nothing`;
  } else {
    await sql`delete from radar.event_mutes where user_id = ${userId} and event_id = ${body.value.eventId}`;
  }
  return ok({ muted: body.value.muted });
});
