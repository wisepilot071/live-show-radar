import { getServerEnv } from "@/config/server-env";
import {
  CALENDAR_SCOPE,
  refreshAccessToken,
  revokeToken,
  type OAuthClient,
  type TokenSet,
} from "@/integrations/google/calendar";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { getSql } from "@/server/db";

/**
 * Per-profile Google Calendar connection. Tokens are AES-256-GCM encrypted at
 * rest and only ever used server-side. "connected" is shown only after Google
 * has actually issued tokens; a refresh rejected by Google flips the
 * connection to "needs_reauth" (the user reconnects from Settings).
 */
export interface GoogleCalendarStatus {
  configured: boolean;
  reason?: string;
}

export function googleCalendarStatus(): GoogleCalendarStatus {
  const env = getServerEnv();
  if (!env.google.clientId || !env.google.clientSecret) return { configured: false, reason: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set" };
  if (!env.appBaseUrl) return { configured: false, reason: "APP_BASE_URL is not set (needed for the OAuth redirect)" };
  if (!env.tokenEncryptionKey && !env.sessionSecret) return { configured: false, reason: "No key for encrypting tokens (TOKEN_ENCRYPTION_KEY or SESSION_SECRET)" };
  return { configured: true };
}

export function oauthClient(): OAuthClient | null {
  const env = getServerEnv();
  if (!googleCalendarStatus().configured || !env.google.clientId || !env.google.clientSecret || !env.appBaseUrl) return null;
  return { clientId: env.google.clientId, clientSecret: env.google.clientSecret, redirectUri: `${env.appBaseUrl}/api/integrations/google/callback` };
}

interface ConnectionRow {
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  access_expires_at: Date | null;
  scope: string;
  status: "connected" | "needs_reauth";
  connected_at: Date;
}

export async function getConnection(userId: string): Promise<ConnectionRow | null> {
  const [row] = await getSql()<ConnectionRow[]>`
    select refresh_token_enc, access_token_enc, access_expires_at, scope, status, connected_at
    from radar.google_calendar_connections where user_id = ${userId}`;
  return row ?? null;
}

export async function saveConnection(userId: string, t: TokenSet) {
  const sql = getSql();
  const existing = await getConnection(userId);
  // Google only returns a refresh token on consent; keep the previous one otherwise.
  const refreshEnc = t.refreshToken ? encryptSecret(t.refreshToken) : (existing?.refresh_token_enc ?? null);
  await sql`
    insert into radar.google_calendar_connections (user_id, refresh_token_enc, access_token_enc, access_expires_at, scope, status, google_sub, google_email)
    values (${userId}, ${refreshEnc}, ${encryptSecret(t.accessToken)}, ${t.expiresAt}, ${t.scope}, 'connected',
            ${t.identity?.sub ?? null}, ${t.identity?.email ?? null})
    on conflict (user_id) do update set refresh_token_enc = excluded.refresh_token_enc, access_token_enc = excluded.access_token_enc,
      access_expires_at = excluded.access_expires_at, scope = excluded.scope, status = 'connected',
      google_sub = coalesce(excluded.google_sub, radar.google_calendar_connections.google_sub),
      google_email = coalesce(excluded.google_email, radar.google_calendar_connections.google_email), updated_at = now()`;
}

export type AccessToken =
  | { ok: true; token: string }
  | { ok: false; reason: "not_connected" | "needs_reauth" | "not_configured" | "temporarily_unavailable"; error?: string };

/** A valid access token for this profile, refreshing it when needed. */
export async function accessTokenFor(userId: string, now = new Date()): Promise<AccessToken> {
  const client = oauthClient();
  if (!client) return { ok: false, reason: "not_configured" };
  const conn = await getConnection(userId);
  if (!conn) return { ok: false, reason: "not_connected" };
  if (conn.status === "needs_reauth") return { ok: false, reason: "needs_reauth" };
  if (!conn.scope.includes(CALENDAR_SCOPE)) return { ok: false, reason: "needs_reauth", error: "calendar permission wasn't granted" };

  if (conn.access_token_enc && conn.access_expires_at && conn.access_expires_at.getTime() > now.getTime() + 30_000) {
    return { ok: true, token: decryptSecret(conn.access_token_enc) };
  }
  if (!conn.refresh_token_enc) {
    await markNeedsReauth(userId);
    return { ok: false, reason: "needs_reauth", error: "no refresh token" };
  }
  const r = await refreshAccessToken(client, decryptSecret(conn.refresh_token_enc), now);
  if (!r.ok) {
    if (r.kind === "auth") {
      await markNeedsReauth(userId);
      return { ok: false, reason: "needs_reauth", error: r.error };
    }
    return { ok: false, reason: "temporarily_unavailable", error: r.error };
  }
  await saveConnection(userId, r.value);
  return { ok: true, token: r.value.accessToken };
}

export async function markNeedsReauth(userId: string) {
  await getSql()`update radar.google_calendar_connections set status = 'needs_reauth', updated_at = now() where user_id = ${userId}`;
}

/** Revokes at Google (best effort) and deletes the stored tokens. Bookings are kept. */
export async function disconnect(userId: string): Promise<{ revoked: boolean }> {
  const conn = await getConnection(userId);
  let revoked = false;
  if (conn?.refresh_token_enc) {
    try {
      revoked = await revokeToken(decryptSecret(conn.refresh_token_enc));
    } catch {
      revoked = false;
    }
  }
  await getSql()`delete from radar.google_calendar_connections where user_id = ${userId}`;
  return { revoked };
}
