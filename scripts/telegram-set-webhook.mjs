#!/usr/bin/env node
/**
 * Registers the Telegram webhook (once per deployment URL), reading the bot
 * token and webhook secret from .env.local without printing them.
 *   node scripts/telegram-set-webhook.mjs https://live-show-radar.vercel.app
 */
import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https:\/\//.test(base)) {
  console.error("Usage: node scripts/telegram-set-webhook.mjs https://<your-domain>");
  process.exit(1);
}
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) {
  console.error("TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET must be set in .env.local");
  process.exit(1);
}
const api = (m, body) =>
  fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${m}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  }).then((r) => r.json());

const set = await api("setWebhook", {
  url: `${base}/api/telegram/webhook`,
  secret_token: env.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ["message"],
  drop_pending_updates: true,
});
console.log("setWebhook:", set.ok ? "ok" : `failed (${set.description})`);
await api("setMyCommands", {
  commands: [
    { command: "start", description: "Connect this chat to Live Show Radar" },
    { command: "stop", description: "Disconnect this chat" },
  ],
});
const info = await api("getWebhookInfo");
console.log("webhook url:", info.result?.url, "| pending:", info.result?.pending_update_count, "| last error:", info.result?.last_error_message ?? "none");
