import { getServerEnv } from "@/config/server-env";
import { randomToken, safeEqual, sha256 } from "@/server/crypto";
import { getSql } from "@/server/db";
import type { SendResult } from "./channels";

/**
 * Telegram Bot API channel (https://core.telegram.org/bots/api).
 *
 * Linking: the signed-in profile asks for a link → we store the SHA-256 of a
 * random single-use token (15 min) and hand back https://t.me/<bot>?start=<token>.
 * The user presses Start in Telegram; the bot's webhook receives "/start <token>",
 * verified by Telegram's X-Telegram-Bot-Api-Secret-Token header. The token is
 * consumed atomically (unused + unexpired) and the chat is bound to that profile.
 * The bot token never leaves the server and is never logged.
 */

const LINK_TTL_MINUTES = 15;

export interface TelegramStatus {
  configured: boolean;
  reason?: string;
  botUsername?: string;
}

export function telegramStatus(): TelegramStatus {
  const { botToken, botUsername, webhookSecret } = getServerEnv().telegram;
  if (!botToken) return { configured: false, reason: "TELEGRAM_BOT_TOKEN is not set" };
  if (!botUsername) return { configured: false, reason: "TELEGRAM_BOT_USERNAME is not set" };
  if (!webhookSecret) return { configured: false, reason: "TELEGRAM_WEBHOOK_SECRET is not set" };
  return { configured: true, botUsername };
}

/** Calls a Bot API method. Never includes the token in errors or logs. */
async function callBotApi(method: string, payload: Record<string, unknown>): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const { botToken } = getServerEnv().telegram;
  if (!botToken) return { ok: false, status: 0, body: { description: "not configured" } };
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok && body.ok === true, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: { description: "network error or timeout" } };
  }
}

/** Sends a plain-text message. 429/5xx/network are retryable; 400/403 (blocked bot, bad chat) are not. */
export async function sendTelegram(input: { chatId: number | string; text: string }): Promise<SendResult> {
  const status = telegramStatus();
  if (!status.configured) return { ok: false, retryable: false, error: status.reason ?? "telegram not configured" };
  const r = await callBotApi("sendMessage", {
    chat_id: input.chatId,
    text: input.text.slice(0, 4000),
    link_preview_options: { is_disabled: true },
  });
  if (r.ok) {
    const id = (r.body.result as { message_id?: number } | undefined)?.message_id;
    return id ? { ok: true, providerMessageId: String(id) } : { ok: false, retryable: false, error: "provider returned no message id" };
  }
  const retryable = r.status === 0 || r.status === 429 || r.status >= 500;
  const description = typeof r.body.description === "string" ? r.body.description.slice(0, 160) : "";
  return { ok: false, retryable, error: `telegram HTTP ${r.status || "network"}${description ? `: ${description}` : ""}` };
}

/** Creates a single-use link token for this profile (older unused tokens are invalidated). */
export async function createLinkToken(userId: string, now = new Date()): Promise<{ url: string; expiresAt: string } | null> {
  const status = telegramStatus();
  if (!status.configured || !status.botUsername) return null;
  const token = randomToken(24);
  const expiresAt = new Date(now.getTime() + LINK_TTL_MINUTES * 60_000);
  const sql = getSql();
  await sql.begin(async (tx) => {
    await tx`delete from radar.telegram_link_tokens where user_id = ${userId} and used_at is null`;
    await tx`insert into radar.telegram_link_tokens (token_hash, user_id, expires_at) values (${sha256(token)}, ${userId}, ${expiresAt})`;
  });
  return { url: `https://t.me/${status.botUsername}?start=${token}`, expiresAt: expiresAt.toISOString() };
}

/** Consumes a token atomically. Returns the profile id, or null if unknown/expired/already used. */
export async function consumeLinkToken(token: string, now = new Date()): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await getSql()<{ user_id: string }[]>`
    update radar.telegram_link_tokens set used_at = ${now}
    where token_hash = ${sha256(token)} and used_at is null and expires_at > ${now}
    returning user_id`;
  return row?.user_id ?? null;
}

export async function linkChat(userId: string, chatId: number, username: string | null) {
  const sql = getSql();
  await sql.begin(async (tx) => {
    // A chat belongs to one profile: relinking moves it.
    await tx`delete from radar.telegram_links where chat_id = ${chatId} and user_id <> ${userId}`;
    await tx`
      insert into radar.telegram_links (user_id, chat_id, username) values (${userId}, ${chatId}, ${username})
      on conflict (user_id) do update set chat_id = excluded.chat_id, username = excluded.username, linked_at = now()`;
  });
}

export async function unlinkUser(userId: string) {
  await getSql()`delete from radar.telegram_links where user_id = ${userId}`;
}

export async function unlinkChat(chatId: number) {
  await getSql()`delete from radar.telegram_links where chat_id = ${chatId}`;
}

export async function telegramLinkOf(userId: string): Promise<{ chatId: string; username: string | null; linkedAt: string } | null> {
  const [row] = await getSql()<{ chat_id: string; username: string | null; linked_at: Date }[]>`
    select chat_id::text, username, linked_at from radar.telegram_links where user_id = ${userId}`;
  return row ? { chatId: row.chat_id, username: row.username, linkedAt: row.linked_at.toISOString() } : null;
}

export function webhookSecretValid(header: string | null): boolean {
  const { webhookSecret } = getServerEnv().telegram;
  return Boolean(webhookSecret && header && safeEqual(header, webhookSecret));
}

interface TelegramUpdate {
  message?: { chat?: { id?: number; type?: string }; from?: { username?: string }; text?: string };
}

/**
 * Handles one webhook update. Only private chats are linked. Replies are
 * best-effort (a failed reply never changes the link result).
 */
export async function handleTelegramUpdate(update: TelegramUpdate, now = new Date()): Promise<"linked" | "invalid_token" | "unlinked" | "ignored" | "help"> {
  const msg = update.message;
  const chatId = msg?.chat?.id;
  const text = msg?.text?.trim() ?? "";
  if (!chatId || msg?.chat?.type !== "private") return "ignored";

  const start = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})$/.exec(text);
  if (start?.[1]) {
    const userId = await consumeLinkToken(start[1], now);
    if (!userId) {
      await callBotApi("sendMessage", {
        chat_id: chatId,
        text: "That link has expired or was already used. Open Live Show Radar → Settings → Telegram and press Connect again.",
      });
      return "invalid_token";
    }
    await linkChat(userId, chatId, msg?.from?.username ?? null);
    await callBotApi("sendMessage", {
      chat_id: chatId,
      text: "Connected ✅ You'll get Live Show Radar alerts here: new shows from artists you follow and booking confirmations. Send /stop to disconnect.",
    });
    return "linked";
  }
  if (/^\/stop(?:@\w+)?$/.test(text)) {
    await unlinkChat(chatId);
    await callBotApi("sendMessage", { chat_id: chatId, text: "Disconnected. You won't get Live Show Radar alerts here any more." });
    return "unlinked";
  }
  await callBotApi("sendMessage", {
    chat_id: chatId,
    text: "Hi! To get alerts here, open Live Show Radar → Settings → Telegram and press Connect. Send /stop to disconnect.",
  });
  return "help";
}
