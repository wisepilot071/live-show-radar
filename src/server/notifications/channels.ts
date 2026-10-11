import nodemailer from "nodemailer";
import { getServerEnv } from "@/config/server-env";

/**
 * Delivery channels, independent of the decision engine.
 *
 * in_app — the inbox. Storing the notification with an in_app delivery of
 *          status "delivered" IS the delivery; read/unread is tracked separately.
 * email  — SMTP (e.g. Gmail with an app password) when SMTP_HOST is set,
 *          otherwise Resend (https://resend.com/docs/api-reference/emails/send-email).
 *          A provider "accepted" response means sent, not that it reached the inbox.
 *          Alerts go ONLY to confirmed addresses (double opt-in: the owner clicked
 *          a link we emailed them) or operator addresses on EMAIL_ALLOWED_RECIPIENTS.
 */
export type ChannelId = "in_app" | "email";

export interface EmailChannelStatus {
  configured: boolean;
  provider?: "smtp" | "resend";
  reason?: string;
}

export function emailChannelStatus(): EmailChannelStatus {
  const { resendApiKey, from, smtp } = getServerEnv().email;
  if (!from) return { configured: false, reason: "EMAIL_FROM (the sender address) is not set" };
  if (smtp) return { configured: true, provider: "smtp" };
  if (!resendApiKey) return { configured: false, reason: "no email provider (SMTP_* or RESEND_API_KEY) is set" };
  return { configured: true, provider: "resend" };
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,24}$/i;

export function validateEmail(address: string | null | undefined): string | null {
  if (!address) return null;
  const a = address.trim().toLowerCase();
  return a.length <= 254 && EMAIL_RE.test(a) ? a : null;
}

/** Operator addresses that count as confirmed without the link (EMAIL_ALLOWED_RECIPIENTS). */
export function preVerified(address: string): boolean {
  return getServerEnv().email.allowedRecipients.includes(address.toLowerCase());
}

/** An address may receive alerts when its owner confirmed it (or the operator pre-verified it). */
export function addressConfirmed(address: string | null, verifiedAddress: string | null): boolean {
  if (!address) return false;
  return preVerified(address) || (!!verifiedAddress && verifiedAddress.toLowerCase() === address.toLowerCase());
}

export type SendResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; retryable: boolean; error: string };

/**
 * Sends one email. Idempotency: Resend gets Idempotency-Key = deliveryId; SMTP
 * has no such header, so callers mark the delivery sent before any retry can run.
 * Callers are responsible for only passing confirmed addresses (or a confirmation link).
 */
export async function sendEmail(input: { deliveryId: string; to: string; subject: string; text: string }): Promise<SendResult> {
  const status = emailChannelStatus();
  const { resendApiKey, from, smtp } = getServerEnv().email;
  if (!status.configured || !from) return { ok: false, retryable: false, error: status.reason ?? "email not configured" };
  const subject = input.subject.slice(0, 200);
  const text = input.text.slice(0, 5000);

  if (status.provider === "smtp" && smtp) {
    try {
      const transport = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.port === 465,
        auth: { user: smtp.user, pass: smtp.pass },
        connectionTimeout: 10_000,
        socketTimeout: 15_000,
      });
      const info = await transport.sendMail({ from, to: input.to, subject, text, headers: { "X-Delivery-Id": input.deliveryId } });
      return info.messageId ? { ok: true, providerMessageId: info.messageId } : { ok: false, retryable: false, error: "SMTP server returned no message id" };
    } catch (err) {
      const code = (err as { responseCode?: number; code?: string }).responseCode;
      // 4xx = temporary, 5xx = permanent (bad address, auth failure, …).
      const retryable = code === undefined || (code >= 400 && code < 500);
      return { ok: false, retryable, error: `SMTP ${code ?? (err as { code?: string }).code ?? "error"}` };
    }
  }

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
      body: JSON.stringify({ from, to: [input.to], subject, text }),
    });
  } catch {
    return { ok: false, retryable: true, error: "network error or timeout" };
  }
  if (res.ok) {
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return body.id ? { ok: true, providerMessageId: body.id } : { ok: false, retryable: false, error: "provider returned no message id" };
  }
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  if (res.status === 403 && /testing emails|own email address|verify a domain/i.test(body.message ?? "")) {
    return {
      ok: false,
      retryable: false,
      error: "Resend is in test mode: it only delivers to the account owner's address until a domain is verified",
    };
  }
  const retryable = res.status === 429 || res.status >= 500;
  return { ok: false, retryable, error: `provider HTTP ${res.status}` };
}
