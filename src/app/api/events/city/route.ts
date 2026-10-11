import { z } from "zod";
import { findCity } from "@/domain/cities";
import { fail, ok } from "@/server/http";
import { meReadRoute } from "@/server/me";
import { listCityEvents } from "@/server/repos/events";

const query = z.object({ city: z.string().max(40), days: z.coerce.number().int().min(1).max(180).default(60) });

/** Upcoming shows in a city for every artist we track (catalogue + everyone's follows). */
export const GET = meReadRoute("api/events/city", async (req, userId) => {
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success || !findCity(parsed.data.city)) return fail(400, "bad_request", "Unknown city.");
  return ok({ events: await listCityEvents(parsed.data.city, parsed.data.days, userId) });
});
