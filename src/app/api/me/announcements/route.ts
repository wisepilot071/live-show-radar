import { z } from "zod";
import { MAX_INPUT_CHARS } from "@/integrations/gemini/announcement-extraction";
import { processAnnouncement } from "@/server/announcements";
import { rateLimit } from "@/server/guards";
import { fail, ok, readBody } from "@/server/http";
import { meRoute } from "@/server/me";

export const maxDuration = 60;

/**
 * Paste an announcement → Gemini extraction → grounded, validated, stored as
 * an unconfirmed user-submitted source. Rate limited per profile and globally.
 */
export const POST = meRoute("api/me/announcements", async (req, userId) => {
  const body = await readBody(
    req,
    z.object({ text: z.string().trim().min(20, "Paste at least a sentence.").max(MAX_INPUT_CHARS), sourceUrl: z.string().max(2000).optional() }),
  );
  if (!body.ok) return body.response;
  for (const [key, max, win] of [[`ai:user:${userId}`, 10, 3600], ["ai:global", 300, 86400]] as const) {
    const r = await rateLimit(key, max, win);
    if (!r.allowed) return fail(429, "rate_limited", "Too many announcements checked recently. Try again later.", { "Retry-After": String(r.retryAfterSeconds) });
  }
  const result = await processAnnouncement(userId, body.value.text, body.value.sourceUrl);
  return result.status === "failed" ? fail(result.category === "not_configured" ? 503 : 502, result.category, result.message) : ok(result);
});
