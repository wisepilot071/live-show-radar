import { z } from "zod";
import { getSql } from "@/server/db";
import { rateLimit } from "@/server/guards";
import { fail, ok, readBody } from "@/server/http";
import { meReadRoute, meRoute } from "@/server/me";
import { createLinkToken, telegramLinkOf, telegramStatus, unlinkUser } from "@/server/notifications/telegram";

/** Telegram connection for this profile. Connected only after the bot received the user's /start. */
export const GET = meReadRoute("api/me/telegram", async (_req, userId) => {
  const status = telegramStatus();
  const link = userId ? await telegramLinkOf(userId) : null;
  const [pref] = userId
    ? await getSql()<{ telegram_enabled: boolean }[]>`select telegram_enabled from radar.user_preferences where user_id = ${userId}`
    : [];
  return ok({
    configured: status.configured,
    reason: status.reason ?? null,
    botUsername: status.botUsername ?? null,
    linked: Boolean(link),
    username: link?.username ?? null,
    linkedAt: link?.linkedAt ?? null,
    enabled: pref?.telegram_enabled ?? true,
  });
});

/** Creates a short-lived, single-use link: open it in Telegram and press Start. */
export const POST = meRoute("api/me/telegram", async (_req, userId) => {
  const limited = await rateLimit(`telegram-link:${userId}`, 10, 3600);
  if (!limited.allowed) return fail(429, "rate_limited", "Too many connection attempts. Try again later.");
  const link = await createLinkToken(userId);
  if (!link) return fail(503, "not_configured", telegramStatus().reason ?? "Telegram isn't configured on this server.");
  return ok(link);
});

/** Turn Telegram alerts on/off without unlinking. */
export const PUT = meRoute("api/me/telegram", async (req, userId) => {
  const body = await readBody(req, z.object({ enabled: z.boolean() }));
  if (!body.ok) return body.response;
  await getSql()`
    insert into radar.user_preferences (user_id, telegram_enabled) values (${userId}, ${body.value.enabled})
    on conflict (user_id) do update set telegram_enabled = excluded.telegram_enabled, updated_at = now()`;
  return ok({ enabled: body.value.enabled });
});

export const DELETE = meRoute("api/me/telegram", async (_req, userId) => {
  await unlinkUser(userId);
  return ok({ linked: false });
});
