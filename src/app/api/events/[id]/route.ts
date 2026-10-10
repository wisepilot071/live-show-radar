import { fail, handle, ok } from "@/server/http";
import { isDatabaseConfigured } from "@/server/db";
import { getEventById } from "@/server/repos/events";
import { currentUserId, isSessionConfigured } from "@/server/session";

/** Canonical event with source evidence. Events are not user-private data. */
export const GET = handle("api/events/[id]", async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  if (!isDatabaseConfigured()) return fail(503, "not_configured", "Event storage isn't configured.");
  const { id } = await ctx.params;
  // Pasted (private) events are only visible to their submitter.
  const event = await getEventById(id, isSessionConfigured() ? await currentUserId() : null);
  return event ? ok({ event }) : fail(404, "not_found", "We can't find this show.");
});
