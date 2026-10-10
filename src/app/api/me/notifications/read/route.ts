import { z } from "zod";
import { getSql } from "@/server/db";
import { ok, readBody } from "@/server/http";
import { meRoute } from "@/server/me";

const bodySchema = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }),
  z.object({ all: z.literal(true) }),
]);

/** Mark specific notifications (or all) as read. Only the caller's own rows are touched. */
export const POST = meRoute("api/me/notifications/read", async (req, userId) => {
  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  const sql = getSql();
  const rows =
    "all" in body.value
      ? await sql`update radar.notifications set read_at = now() where user_id = ${userId} and read_at is null returning id`
      : await sql`update radar.notifications set read_at = now()
                  where user_id = ${userId} and id = any(${body.value.ids}) and read_at is null returning id`;
  return ok({ marked: rows.length });
});
