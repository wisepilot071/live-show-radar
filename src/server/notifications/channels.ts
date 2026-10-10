import { getServerEnv } from "@/config/server-env";

/**
 * Delivery channels, independent of the decision engine.
 *
 * in_app — the inbox. Storing the notification with an in_app delivery of
 *          status "delivered" IS the delivery; read/unread is tracked separately.
 * email  — Resend (https://resend.com/docs/api-reference/emails/send-email).
 *          A 200 response means Resend ACCEPTED the message ("sent"), not that
 *          it reached the inbox. Requires RESEND_API_KEY + EMAIL_FROM (a verified
 *          sender) AND the recipient on EMAIL_ALLOWED_RECIPIENTS: there is no
 *          double opt-in yet, so arbitrary addresses are never mailed.
 */
export type ChannelId = "in_app" | "email";

export interface EmailChannelStatus {
  configured: boolean;
  reason?: string;
}

export function emailChannelStatus(): EmailChannelStatus {
  const { resendApiKey, from, allowedRecipients } = getServerEnv().email;
  if (!resendApiKey) return { configured: false, reason: "RESEND_API_KEY is not set" };
  if (!from) return { configured: false, reason: "EMAIL_FROM (a verified sender) is not set" };
  if (allowedRecipients.length === 0) return { configured: false, reason: "EMAIL_ALLOWED_RECIPIENTS is empty (no double opt-in yet)" };
  return { configured: true };
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,24}$/i;

export function validateEmail(address: string | null | undefined): string | null {
  if (!address) return null;
  const a = address.trim().toLowerCase();
  return a.length <= 254 && EMAIL_RE.test(a) ? a : null;
}

export function recipientAllowed(address: string): boolean {
  return getServerEnv().email.allowedRecipients.includes(address.toLowerCase());
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; retryable: boolean; error: string };

/** Sends one email via Resend. Idempotency-Key = delivery id, so retries can't double-send. */
export async function sendEmail(input: {
  deliveryId: string;
  to: string;
  subject: string;
  text: string;
}): Promise<SendResult> {
  const status = emailChannelStatus();
  const { resendApiKey, from } = getServerEnv().email;
  if (!status.configured || !resendApiKey || !from) return { ok: false, retryable: false, error: status.reason ?? "email not configured" };
  if (!recipientAllowed(input.to)) return { ok: false, retryable: false, error: "recipient not on EMAIL_ALLOWED_RECIPIENTS" };

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.deliveryId,
      },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject.slice(0, 200), text: input.text.slice(0, 5000) }),
    });
  } catch {
    return { ok: false, retryable: true, error: "network error or timeout" };
  }
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return body.id ? { ok: true, providerMessageId: body.id } : { ok: false, retryable: false, error: "provider returned no message id" };
  }
  const retryable = res.status === 429 || res.status >= 500;
  return { ok: false, retryable, error: `provider HTTP ${res.status}` };
}
