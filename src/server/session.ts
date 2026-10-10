import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getServerEnv } from "@/config/server-env";
import { getSql } from "./db";
import { fail } from "./http";

/**
 * Anonymous profile identity — NOT authentication.
 *
 * There is no login in Live Show Radar yet. Each browser gets a random
 * profile id in a signed, httpOnly, SameSite=Lax cookie. The id is the
 * only thing that scopes user data on the server. Limitations (documented):
 * clearing cookies loses access to the profile; it doesn't follow you to
 * another device; anyone holding the cookie value has that profile.
 * A real auth system can later link its user to this row.
 */
const COOKIE = "lsr_profile";
const MAX_AGE = 60 * 60 * 24 * 400; // ~13 months (browser cap)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class SessionNotConfiguredError extends Error {
  constructor() {
    super("SESSION_SECRET is not set");
    this.name = "SessionNotConfiguredError";
  }
}

function secret(): string {
  const s = getServerEnv().sessionSecret;
  if (!s) throw new SessionNotConfiguredError();
  return s;
}

function sign(id: string): string {
  return createHmac("sha256", secret()).update(id).digest("base64url");
}

function verify(value: string | undefined): string | null {
  if (!value) return null;
  const [id, sig] = value.split(".");
  if (!id || !sig || !UUID.test(id)) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

export function isSessionConfigured(): boolean {
  return Boolean(getServerEnv().sessionSecret);
}

/** Returns the caller's profile id, or null when they have none yet. */
export async function currentUserId(): Promise<string | null> {
  const store = await cookies();
  return verify(store.get(COOKIE)?.value);
}

/**
 * Returns the caller's profile id, creating an anonymous profile (and its
 * cookie) on first write. The users row is upserted so a wiped database
 * can't strand a still-valid cookie.
 */
export async function ensureUserId(): Promise<string> {
  const store = await cookies();
  let id = verify(store.get(COOKIE)?.value);
  if (!id) {
    id = randomUUID();
    store.set(COOKIE, `${id}.${sign(id)}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: MAX_AGE,
    });
  }
  const sql = getSql();
  await sql`insert into radar.users (id, last_seen_at) values (${id}, now())
            on conflict (id) do update set last_seen_at = now()`;
  return id;
}

/** Forget the profile cookie (used by "Reset everything"). */
export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/**
 * CSRF defence in depth for cookie-authenticated mutations: the browser's
 * Origin must match this host. (SameSite=Lax already blocks cross-site POSTs.)
 */
export function rejectCrossOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (!origin) return null; // same-origin fetches from older browsers / server calls
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    if (host && new URL(origin).host === host) return null;
  } catch {
    // malformed Origin header
  }
  return fail(403, "unauthorized", "Cross-site requests aren't allowed.");
}
