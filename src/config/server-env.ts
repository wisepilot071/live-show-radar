/**
 * Server-only configuration — the ONLY module that reads process.env.
 *
 * Import from route handlers and src/server/** only. Clients learn about
 * integrations exclusively through /api/integrations/status, which returns
 * booleans and labels, never values.
 *
 * Missing values are a normal "not configured" state, not a crash: every
 * page renders without any integration configured.
 */
if (typeof window !== "undefined") {
  throw new Error("server-env must not be imported in browser code");
}

function read(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : undefined;
}

export interface ServerEnv {
  appBaseUrl?: string;
  databaseUrl?: string;
  /** HMAC key for the anonymous profile cookie. Required for server persistence. */
  sessionSecret?: string;
  /** Bearer token for POST /api/admin/discovery (Part 4 scheduler uses it). */
  discoveryAdminToken?: string;
  /** apiKeys: GEMINI_API_KEY first, then GEMINI_API_KEYS (comma-separated backups), de-duplicated. */
  gemini: { apiKey?: string; apiKeys: string[]; model: string; fallbackModel?: string };
  musicbrainz: { enabled: boolean; contact?: string };
  ticketmaster: { apiKey?: string };
  /** ScrapingBee Google News search (announcement discovery); 10 credits per search. */
  scrapingbee: { apiKey?: string; maxArtistsPerRun: number; sweepCities: string[] };
  bandsintown: { appId?: string };
  /** Vercel Cron sends "Authorization: Bearer $CRON_SECRET". */
  cronSecret?: string;
  /**
   * Email: SMTP (e.g. Gmail + app password) when SMTP_HOST is set, otherwise Resend.
   * allowedRecipients: operator addresses treated as already confirmed (everyone else confirms via a link).
   */
  email: {
    resendApiKey?: string;
    from?: string;
    allowedRecipients: string[];
    smtp?: { host: string; port: number; user: string; pass: string };
  };
  /** Deadline reminder windows in hours before an early-bird deadline. */
  reminderWindowsHours: number[];
  /** Telegram bot (notifications + account linking via webhook). */
  telegram: { botToken?: string; botUsername?: string; webhookSecret?: string };
  /** Google Calendar OAuth client (scope: calendar.events). */
  google: { clientId?: string; clientSecret?: string };
  /** 32-byte key (base64url) for OAuth tokens at rest; derived from SESSION_SECRET when unset. */
  tokenEncryptionKey?: string;
}

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

export function getServerEnv(): ServerEnv {
  return {
    // Public URL used in emails/Telegram links and OAuth redirects. On Vercel the
    // production domain is provided automatically if APP_BASE_URL isn't set.
    appBaseUrl:
      read("APP_BASE_URL")?.replace(/\/+$/, "") ??
      (read("VERCEL_PROJECT_PRODUCTION_URL") ? `https://${read("VERCEL_PROJECT_PRODUCTION_URL")}` : undefined),
    databaseUrl: read("DATABASE_URL"),
    sessionSecret: read("SESSION_SECRET"),
    discoveryAdminToken: read("DISCOVERY_ADMIN_TOKEN"),
    gemini: {
      apiKey: read("GEMINI_API_KEY") ?? (read("GEMINI_API_KEYS") ?? "").split(",").map((k) => k.trim()).find(Boolean),
      apiKeys: [...new Set([read("GEMINI_API_KEY"), ...(read("GEMINI_API_KEYS") ?? "").split(",").map((k) => k.trim())].filter((k): k is string => Boolean(k)))],
      model: read("GEMINI_MODEL") ?? DEFAULT_GEMINI_MODEL,
      fallbackModel: read("GEMINI_FALLBACK_MODEL"),
    },
    musicbrainz: { enabled: read("MUSICBRAINZ_ENABLED") !== "false", contact: read("MUSICBRAINZ_CONTACT") },
    ticketmaster: { apiKey: read("TICKETMASTER_API_KEY") },
    scrapingbee: {
      apiKey: read("SCRAPINGBEE_API_KEY"),
      maxArtistsPerRun: Math.min(50, Math.max(1, Number(read("SCRAPINGBEE_MAX_ARTISTS_PER_RUN") ?? 3) || 3)),
      // Cities swept daily for every target artist's shows (comma-separated).
      sweepCities: (read("NEWS_SWEEP_CITIES") ?? "Bengaluru").split(",").map((c) => c.trim()).filter(Boolean),
    },
    bandsintown: { appId: read("BANDSINTOWN_APP_ID") },
    cronSecret: read("CRON_SECRET"),
    email: {
      resendApiKey: read("RESEND_API_KEY"),
      from: read("EMAIL_FROM"),
      allowedRecipients: (read("EMAIL_ALLOWED_RECIPIENTS") ?? "")
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean),
      smtp: (() => {
        const host = read("SMTP_HOST");
        const user = read("SMTP_USER");
        const pass = read("SMTP_PASS");
        if (!host || !user || !pass) return undefined;
        return { host, port: Number(read("SMTP_PORT") ?? 465) || 465, user, pass };
      })(),
    },
    reminderWindowsHours: (read("REMINDER_WINDOWS_HOURS") ?? "72,24")
      .split(",")
      .map(Number)
      .filter((n) => Number.isFinite(n) && n > 0 && n <= 24 * 14)
      .sort((a, b) => b - a),
    telegram: {
      botToken: read("TELEGRAM_BOT_TOKEN"),
      botUsername: read("TELEGRAM_BOT_USERNAME")?.replace(/^@/, ""),
      webhookSecret: read("TELEGRAM_WEBHOOK_SECRET"),
    },
    google: { clientId: read("GOOGLE_CLIENT_ID"), clientSecret: read("GOOGLE_CLIENT_SECRET") },
    tokenEncryptionKey: read("TOKEN_ENCRYPTION_KEY"),
  };
}
