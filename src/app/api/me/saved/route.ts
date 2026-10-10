import { z } from "zod";
import { findIllustrativeEvent } from "@/data/illustrative-events";
import { fail, ok, readBody } from "@/server/http";
import { meReadRoute, meRoute } from "@/server/me";
import { getEventById } from "@/server/repos/events";
import { getProfile, saveShow, unsaveShow } from "@/server/repos/profile";

export const GET = meReadRoute("api/me/saved", async (_req, userId) =>
  ok({ savedEvents: userId ? (await getProfile(userId)).savedEvents : [] }),
);

/**
 * Save a show. The server never trusts a client-supplied event: canonical ids
 * are loaded from the database, example ids from the bundled illustrative set.
 */
export const POST = meRoute("api/me/saved", async (req, userId) => {
  const body = await readBody(req, z.object({ eventId: z.string().min(1).max(100), savedAt: z.string().datetime({ offset: true }).optional() }));
  if (!body.ok) return body.response;
  const { eventId } = body.value;
  const event = (await getEventById(eventId, userId)) ?? findIllustrativeEvent(eventId);
  if (!event) return fail(404, "not_found", "That show doesn't exist (any more).");
  await saveShow(userId, eventId, event, body.value.savedAt ?? new Date().toISOString());
  return ok({ saved: true, event });
});

export const DELETE = meRoute("api/me/saved", async (req, userId) => {
  const id = z.string().min(1).max(100).safeParse(new URL(req.url).searchParams.get("eventId"));
  if (!id.success) return fail(400, "bad_request", "Missing eventId.");
  return ok({ removed: await unsaveShow(userId, id.data) });
});
