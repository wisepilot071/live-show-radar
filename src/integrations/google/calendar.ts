import type { LiveEvent } from "@/domain/types";

/**
 * Google Calendar (OAuth 2.0 web server flow + Calendar API v3), minimum scope
 * calendar.events. Plain fetch, no SDK. All functions are server-only.
 *
 * Idempotency: calendar events are inserted with a client-chosen id derived
 * from the booking id. Retrying an insert that already succeeded returns 409,
 * which is treated as "already exists" (then fetched) — never a duplicate.
 *
 * Times are never invented: the event data has no end time, so a booked show
 * becomes an all-day event on its local date; a known start time is put in
 * the title/description. Without a date the event cannot be added.
 */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function authorizationUrl(client: OAuthClient, state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set("client_id", client.clientId);
  u.searchParams.set("redirect_uri", client.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", CALENDAR_SCOPE);
  u.searchParams.set("access_type", "offline"); // refresh token
  u.searchParams.set("prompt", "consent"); // always return a refresh token
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u.toString();
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
  scope: string;
}

export type GoogleResult<T> =
  | { ok: true; value: T }
  | { ok: false; kind: "auth" | "retryable" | "rejected"; status: number; error: string };

async function post(url: string, form: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return null;
  }
}

function tokensFrom(body: Record<string, unknown>, now: Date): TokenSet | null {
  if (typeof body.access_token !== "string") return null;
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : undefined,
    expiresAt: new Date(now.getTime() + Math.max(60, expiresIn - 60) * 1000),
    scope: typeof body.scope === "string" ? body.scope : CALENDAR_SCOPE,
  };
}

export async function exchangeCode(client: OAuthClient, code: string, now = new Date()): Promise<GoogleResult<TokenSet>> {
  const r = await post(TOKEN_URL, {
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: client.redirectUri,
    grant_type: "authorization_code",
  });
  if (!r) return { ok: false, kind: "retryable", status: 0, error: "network error or timeout" };
  const t = r.status === 200 ? tokensFrom(r.body, now) : null;
  if (t) return { ok: true, value: t };
  return { ok: false, kind: r.status >= 500 ? "retryable" : "rejected", status: r.status, error: String(r.body.error ?? "token exchange failed") };
}

export async function refreshAccessToken(client: Omit<OAuthClient, "redirectUri">, refreshToken: string, now = new Date()): Promise<GoogleResult<TokenSet>> {
  const r = await post(TOKEN_URL, {
    refresh_token: refreshToken,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    grant_type: "refresh_token",
  });
  if (!r) return { ok: false, kind: "retryable", status: 0, error: "network error or timeout" };
  const t = r.status === 200 ? tokensFrom(r.body, now) : null;
  if (t) return { ok: true, value: t };
  // invalid_grant = revoked or expired authorisation → the user must reconnect.
  if (r.status === 400 || r.status === 401) return { ok: false, kind: "auth", status: r.status, error: String(r.body.error ?? "authorisation no longer valid") };
  return { ok: false, kind: "retryable", status: r.status, error: String(r.body.error ?? "token refresh failed") };
}

export async function revokeToken(token: string): Promise<boolean> {
  const r = await post(REVOKE_URL, { token });
  return r !== null && (r.status === 200 || r.status === 400); // 400: already invalid
}

/** Deterministic Calendar event id (base32hex alphabet: 0-9 a-v) for a booking. */
export function calendarEventIdFor(bookingId: string): string {
  return `lsr${bookingId.replace(/-/g, "").toLowerCase()}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function localDateOf(event: LiveEvent): string | null {
  if (event.when.date && /^\d{4}-\d{2}-\d{2}$/.test(event.when.date)) return event.when.date;
  if (event.when.startsAt) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: event.when.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(event.when.startsAt),
    );
  }
  return null;
}

function localTimeOf(event: LiveEvent): string | null {
  if (!event.when.startsAt) return null;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: event.when.timeZone, timeZoneName: "short" }).format(
    new Date(event.when.startsAt),
  );
}

export interface CalendarEventBody {
  id: string;
  summary: string;
  location?: string;
  description: string;
  start: { date: string };
  end: { date: string };
  source?: { title: string; url: string };
}

/** Builds the Calendar event from real event data, or explains why it can't. */
export function buildCalendarEvent(
  event: LiveEvent,
  bookingId: string,
  appBaseUrl?: string,
): { ok: true; body: CalendarEventBody } | { ok: false; reason: string } {
  const date = localDateOf(event);
  if (!date) return { ok: false, reason: "The show's date hasn't been announced, so it can't be added to your calendar yet." };
  const time = localTimeOf(event);
  const artists = event.artistNames.join(", ");
  const lines = [
    `${artists} — ${event.title}`,
    time ? `Starts: ${time} (end time not announced)` : "Start time not announced.",
    `Venue: ${event.venueName ?? "not announced"}, ${event.cityName}`,
    event.ticket.bookingUrl ? `Tickets: ${event.ticket.bookingUrl}` : null,
    appBaseUrl ? `Live Show Radar: ${appBaseUrl}/radar/events/${encodeURIComponent(event.id)}` : null,
    "Booking recorded by you in Live Show Radar (not verified with the ticket seller).",
  ].filter(Boolean);
  return {
    ok: true,
    body: {
      id: calendarEventIdFor(bookingId),
      summary: time ? `${artists} (${time})` : artists,
      location: [event.venueName, event.cityName].filter(Boolean).join(", ") || undefined,
      description: lines.join("\n"),
      start: { date },
      end: { date: addDays(date, 1) }, // all-day: end date is exclusive
      ...(appBaseUrl ? { source: { title: "Live Show Radar", url: `${appBaseUrl}/bookings` } } : {}),
    },
  };
}

async function api(
  method: "POST" | "GET" | "DELETE",
  url: string,
  accessToken: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  try {
    const res = await fetch(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return null;
  }
}

function classify(status: number, body: Record<string, unknown>): GoogleResult<never> {
  const message = (body.error as { message?: string } | undefined)?.message ?? `HTTP ${status}`;
  if (status === 401) return { ok: false, kind: "auth", status, error: "Google Calendar authorisation expired or was revoked" };
  if (status === 403 && /insufficient|scope|permission/i.test(message)) return { ok: false, kind: "auth", status, error: message };
  if (status === 429 || status >= 500 || status === 403) return { ok: false, kind: "retryable", status, error: message };
  return { ok: false, kind: "rejected", status, error: message };
}

/** Inserts the event; 409 (already exists from an earlier attempt) returns the existing one. */
export async function upsertCalendarEvent(accessToken: string, body: CalendarEventBody): Promise<GoogleResult<{ id: string; htmlLink: string | null }>> {
  const r = await api("POST", API, accessToken, body);
  if (!r) return { ok: false, kind: "retryable", status: 0, error: "network error or timeout" };
  if (r.status === 200) return { ok: true, value: { id: String(r.body.id), htmlLink: typeof r.body.htmlLink === "string" ? r.body.htmlLink : null } };
  if (r.status === 409) {
    const g = await api("GET", `${API}/${encodeURIComponent(body.id)}`, accessToken);
    if (g?.status === 200 && g.body.status !== "cancelled") {
      return { ok: true, value: { id: String(g.body.id), htmlLink: typeof g.body.htmlLink === "string" ? g.body.htmlLink : null } };
    }
    // The id exists but was deleted by the user: the id can't be reused, so report it.
    return { ok: false, kind: "rejected", status: 409, error: "This booking's calendar event was deleted in Google Calendar." };
  }
  return classify(r.status, r.body);
}

export async function deleteCalendarEvent(accessToken: string, eventId: string): Promise<GoogleResult<true>> {
  const r = await api("DELETE", `${API}/${encodeURIComponent(eventId)}`, accessToken);
  if (!r) return { ok: false, kind: "retryable", status: 0, error: "network error or timeout" };
  if (r.status === 204 || r.status === 200 || r.status === 404 || r.status === 410) return { ok: true, value: true };
  return classify(r.status, r.body);
}
