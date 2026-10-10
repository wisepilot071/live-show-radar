import { z } from "zod";
import { buildDiscoveryReport } from "@/server/discovery-report";
import { fail, ok } from "@/server/http";
import { meReadRoute } from "@/server/me";

const filtersSchema = z.object({
  city: z.string().max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  artist: z.string().max(200).optional(),
  status: z.enum(["scheduled", "cancelled", "rescheduled"]).optional(),
});

/** Events for the caller's followed artists + the honest discovery status. */
export const GET = meReadRoute("api/me/events", async (req, userId) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = filtersSchema.safeParse(params);
  if (!parsed.success) return fail(400, "bad_request", "Invalid filters.");
  const f = parsed.data;
  if (!userId) return fail(404, "not_found", "No profile yet — add an artist first.");
  return ok({ report: await buildDiscoveryReport(userId, { cityId: f.city, from: f.from, to: f.to, artistKey: f.artist, status: f.status }) });
});
