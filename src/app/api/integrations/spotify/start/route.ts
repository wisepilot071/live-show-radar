import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizationUrl } from "@/integrations/spotify/client";
import { RETURN_PATHS, SPOTIFY_STATE_COOKIE as STATE_COOKIE, spotifyClient } from "@/integrations/spotify/server";
import { randomToken } from "@/server/crypto";
import { isDatabaseConfigured } from "@/server/db";
import { ensureUserId, isSessionConfigured } from "@/server/session";

/**
 * Starts the one-time Spotify import for the CURRENT profile (created if this
 * browser has none yet). A random state is kept in an httpOnly cookie and
 * echoed by Spotify; the callback rejects any mismatch.
 */
export async function GET(req: Request) {
  const ret = new URL(req.url).searchParams.get("from") === "onboarding" ? "o" : "a";
  const back = new URL(RETURN_PATHS[ret], req.url);
  const client = spotifyClient();
  if (!client || !isDatabaseConfigured() || !isSessionConfigured()) {
    back.searchParams.set("spotify", "not_configured");
    return NextResponse.redirect(back, { status: 303 });
  }
  const userId = await ensureUserId();
  const state = randomToken(24);
  (await cookies()).set(STATE_COOKIE, `${state}.${userId}.${ret}`, {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:",
    sameSite: "lax", // sent on Spotify's top-level redirect back to us
    path: "/api/integrations/spotify",
    maxAge: 600,
  });
  return NextResponse.redirect(authorizationUrl(client, state), { status: 303 });
}
