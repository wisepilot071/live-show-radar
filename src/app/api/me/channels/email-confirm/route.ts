import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getServerEnv } from "@/config/server-env";
import { getSql } from "@/server/db";
import { rateLimit } from "@/server/guards";
import { fail, ok } from "@/server/http";
import { meRoute } from "@/server/me";
import { addressConfirmed, emailChannelStatus, sendEmail, validateEmail } from "@/server/notifications/channels";

const TOKEN_TTL_HOURS = 24;

/**
 * Double opt-in, step 1: email a one-time confirmation link to the address saved
 * in this profile's alert settings. Only a SHA-256 hash of the token is stored.
 * Rate-limited per profile and per address so it can't be used to spam anyone.
 */
export const POST = meRoute("api/me/channels/email-confirm", async (_req, userId) => {
  const status = emailChannelStatus();
  if (!status.configured) return fail(503, "not_configured", `Email isn't configured on this server (${status.reason}).`);
  const sql = getSql();
  const [prefs] = await sql<{ email_address: string | null; email_verified_address: string | null }[]>`
    select email_address, email_verified_address from radar.user_preferences where user_id = ${userId}`;
  const address = validateEmail(prefs?.email_address);
  if (!address) return fail(400, "bad_request", "Save an email address first.");
  if (addressConfirmed(address, prefs?.email_verified_address ?? null)) return ok({ alreadyConfirmed: true });

  const baseUrl = getServerEnv().appBaseUrl;
  if (!baseUrl) return fail(503, "not_configured", "APP_BASE_URL isn't set, so a confirmation link can't be built.");
  const perUser = await rateLimit(`email-confirm:user:${userId}`, 5, 3600);
  const perAddress = await rateLimit(`email-confirm:addr:${address}`, 3, 3600);
  if (!perUser.allowed || !perAddress.allowed) return fail(429, "rate_limited", "Too many confirmation emails. Try again in an hour.");

  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  await sql`
    update radar.user_preferences
    set email_verify_token_hash = ${hash},
        email_verify_expires_at = now() + make_interval(hours => ${TOKEN_TTL_HOURS}),
        email_verify_sent_at = now(), updated_at = now()
    where user_id = ${userId}`;

  const link = `${baseUrl.replace(/\/$/, "")}/api/email/confirm?token=${token}`;
  const sent = await sendEmail({
    deliveryId: randomUUID(),
    to: address,
    subject: "Confirm your email for Live Show Radar alerts",
    text: [
      "Hi!",
      "",
      "Someone (hopefully you) asked Live Show Radar to send concert alerts to this address.",
      "Confirm it by opening this link:",
      link,
      "",
      `The link works for ${TOKEN_TTL_HOURS} hours. If this wasn't you, ignore this email — nothing will be sent.`,
    ].join("\n"),
  });
  if (!sent.ok) return fail(502, "source_unavailable", `The confirmation email couldn't be sent: ${sent.error}.`);
  return ok({ sentTo: address });
});
