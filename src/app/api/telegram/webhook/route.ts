import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/server/db";
import { errorMessage, log } from "@/server/log";
import { handleTelegramUpdate, webhookSecretValid } from "@/server/notifications/telegram";

/**
 * Telegram Bot API webhook. Telegram sends the secret registered with
 * setWebhook in X-Telegram-Bot-Api-Secret-Token; anything else is rejected
 * before the body is read. Returns 200 once handled so Telegram doesn't retry;
 * 500 on our own failure so it does.
 */
export async function POST(req: Request) {
  if (!webhookSecretValid(req.headers.get("x-telegram-bot-api-secret-token"))) {
    return new NextResponse(null, { status: 401 });
  }
  if (!isDatabaseConfigured()) return new NextResponse(null, { status: 503 });
  const raw = await req.text();
  if (raw.length > 100_000) return new NextResponse(null, { status: 413 });
  let update: unknown;
  try {
    update = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  try {
    const outcome = await handleTelegramUpdate(update as Parameters<typeof handleTelegramUpdate>[0]);
    log.info("telegram.webhook", "update handled", { outcome });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error("telegram.webhook", "update failed", { error: errorMessage(err) });
    return new NextResponse(null, { status: 500 });
  }
}
