import { z } from "zod";
import { isDatabaseConfigured } from "./db";
import { fail, handle } from "./http";
import { currentUserId, ensureUserId, isSessionConfigured, rejectCrossOrigin } from "./session";

/**
 * Wrapper for every /api/me/* route:
 * - 503 not_configured when the database or session secret is missing
 *   (the client then keeps using browser storage and says so)
 * - same-origin check on mutations
 * - resolves (or creates) the anonymous profile id
 */
export function meRoute<C>(scope: string, fn: (req: Request, userId: string, ctx: C) => Promise<Response>) {
  return handle(scope, async (req: Request, ctx: C) => {
    if (!isDatabaseConfigured() || !isSessionConfigured()) {
      return fail(503, "not_configured", "Server storage isn't configured, so your radar is kept in this browser.");
    }
    const blocked = rejectCrossOrigin(req);
    if (blocked) return blocked;
    return fn(req, await ensureUserId(), ctx);
  });
}

/**
 * Read-only variant for GET routes. It NEVER creates a profile: a browser
 * without a cookie gets `userId = null` (an empty profile). Profiles are
 * created only by the first write — otherwise two concurrent first reads
 * would each mint a different profile and data could land in the wrong one.
 */
export function meReadRoute<C>(scope: string, fn: (req: Request, userId: string | null, ctx: C) => Promise<Response>) {
  return handle(scope, async (req: Request, ctx: C) => {
    if (!isDatabaseConfigured() || !isSessionConfigured()) {
      return fail(503, "not_configured", "Server storage isn't configured, so your radar is kept in this browser.");
    }
    return fn(req, await currentUserId(), ctx);
  });
}

/* Shared input schemas */

export const artistInputSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  origin: z.enum(["sample_catalogue", "user_entered", "musicbrainz", "spotify", "event_source", "illustrative", "user_submitted"]),
  externalIds: z.object({ musicbrainz: z.string().max(64).optional(), spotify: z.string().max(64).optional() }).optional(),
  aliases: z.array(z.string().max(200)).max(20).optional(),
  disambiguation: z.string().max(300).optional(),
  country: z.string().max(80).optional(),
  genres: z.array(z.string().max(80)).max(10).optional(),
  imageUrl: z.string().max(2000).optional(),
});

export const selectionInputSchema = z.object({
  artist: artistInputSchema,
  addedVia: z.enum(["manual", "spotify"]),
  selectedAt: z.string().datetime({ offset: true }),
});
