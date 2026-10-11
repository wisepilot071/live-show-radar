import { z } from "zod";
import { getSql } from "@/server/db";
import { fail, ok, readBody } from "@/server/http";
import { meReadRoute, meRoute } from "@/server/me";
import { addressConfirmed, emailChannelStatus, validateEmail } from "@/server/notifications/channels";

/** Notification channel settings plus their REAL availability on this server. */
export const GET = meReadRoute("api/me/channels", async (_req, userId) => {
  const email = emailChannelStatus();
  const [row] = userId
    ? await getSql()<
        {
          in_app_enabled: boolean;
          email_enabled: boolean;
          email_address: string | null;
          email_verified_address: string | null;
          email_verify_sent_at: Date | null;
        }[]
      >`
        select in_app_enabled, email_enabled, email_address, email_verified_address, email_verify_sent_at
        from radar.user_preferences where user_id = ${userId}`
    : [];
  return ok({
    inApp: { available: true, enabled: row?.in_app_enabled ?? true },
    email: {
      available: email.configured,
      reason: email.reason ?? null,
      enabled: row?.email_enabled ?? false,
      address: row?.email_address ?? null,
      /** The owner clicked our confirmation link for this exact address (or the operator pre-verified it). */
      confirmed: addressConfirmed(row?.email_address ?? null, row?.email_verified_address ?? null),
      confirmationSentAt: row?.email_verify_sent_at?.toISOString() ?? null,
    },
  });
});

const bodySchema = z.object({
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  emailAddress: z.string().max(254).nullable(),
});

export const PUT = meRoute("api/me/channels", async (req, userId) => {
  const body = await readBody(req, bodySchema);
  if (!body.ok) return body.response;
  const { inAppEnabled, emailEnabled } = body.value;
  const address = body.value.emailAddress ? validateEmail(body.value.emailAddress) : null;
  if (body.value.emailAddress && !address) return fail(400, "bad_request", "That email address doesn't look valid.");
  if (emailEnabled && !address) return fail(400, "bad_request", "Add an email address to turn on email alerts.");
  await getSql()`
    insert into radar.user_preferences (user_id, in_app_enabled, email_enabled, email_address)
    values (${userId}, ${inAppEnabled}, ${emailEnabled}, ${address})
    on conflict (user_id) do update set
      in_app_enabled = excluded.in_app_enabled, email_enabled = excluded.email_enabled,
      email_address = excluded.email_address, updated_at = now()`;
  return ok({ saved: true });
});
