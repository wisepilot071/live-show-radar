import { z } from "zod";
import { deleteBooking, getBooking } from "@/server/bookings";
import { fail, ok } from "@/server/http";
import { meReadRoute, meRoute } from "@/server/me";

type Ctx = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();

export const GET = meReadRoute<Ctx>("api/me/bookings/[id]", async (_req, userId, ctx) => {
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success || !userId) return fail(404, "not_found", "Booking not found.");
  const booking = await getBooking(userId, id.data);
  return booking ? ok({ booking }) : fail(404, "not_found", "Booking not found.");
});

/** Undo a booking recorded by mistake (also removes its calendar event when possible). */
export const DELETE = meRoute<Ctx>("api/me/bookings/[id]", async (_req, userId, ctx) => {
  const id = idSchema.safeParse((await ctx.params).id);
  if (!id.success) return fail(404, "not_found", "Booking not found.");
  const r = await deleteBooking(userId, id.data);
  return r.deleted ? ok(r) : fail(404, "not_found", "Booking not found.");
});
