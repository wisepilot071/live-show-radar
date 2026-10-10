#!/usr/bin/env node
/**
 * Copies server env vars from .env.local into a linked Vercel project without printing values.
 * Values go to `vercel env add` over stdin, marked sensitive. DATABASE_URL is switched to the
 * transaction-mode pooler (:6543), which serverless functions need.
 *
 * Usage (after `npx vercel login` and `npx vercel link`):
 *   node scripts/vercel-env-push.mjs [production|preview]
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const target = process.argv[2] ?? "production";
const KEYS = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "CRON_SECRET",
  "DISCOVERY_ADMIN_TOKEN",
  "GEMINI_API_KEY",
  "GEMINI_MODEL",
  "GEMINI_FALLBACK_MODEL",
  "MUSICBRAINZ_CONTACT",
  "EMAIL_ALLOWED_RECIPIENTS",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "REMINDER_WINDOWS_HOURS",
];

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_][A-Z0-9_]*=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1")];
    }),
);

if (env.DATABASE_URL) env.DATABASE_URL = env.DATABASE_URL.replace(/:5432\//, ":6543/");

for (const key of KEYS) {
  const value = env[key];
  if (!value) {
    console.log(`skip  ${key} (not set locally)`);
    continue;
  }
  const res = spawnSync("npx", ["vercel", "env", "add", key, target, "--sensitive", "--force"], {
    input: value,
    stdio: ["pipe", "ignore", "pipe"],
    shell: process.platform === "win32",
  });
  console.log(res.status === 0 ? `set   ${key}` : `FAIL  ${key}: ${String(res.stderr).split("\n")[0]}`);
}
