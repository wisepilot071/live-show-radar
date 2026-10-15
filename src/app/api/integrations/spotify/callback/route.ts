import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import { musicBrainzEvents } from "@/integrations/events/musicbrainz";
import { ticketmasterEvents } from "@/integrations/events/ticketmaster";
import { exchangeCode, fetchSpotifyArtists } from "@/integrations/spotify/client";
import { RETURN_PATHS, SPOTIFY_STATE_COOKIE as STATE_COOKIE, spotifyClient } from "@/integrations/spotify/server";
import { safeEqual } from "@/server/crypto";
import { runDiscovery } from "@/server/ingest/pipeline";
import { errorMessage, log } from "@/server/log";
import { currentUserId } from "@/server/session";
import { importSpotifyArtists } from "@/server/spotify-import";

export const maxDuration = 300;

/** Time spent importing before the redirect, so most lists show up straight away. */
const FOREGROUND_MS = 35_000;
/** The rest continues after the response, inside the function's lifetime. */
const BACKGROUND_MS = 240_000;

/**
 * OAuth redirect URI: <APP_BASE_URL>/api/integrations/spotify/callback
 * Verifies state (cookie vs query, bound to the same profile), exchanges the
 * code server-side, reads followed + top artists once, and follows them.
 * The access token is used only inside this request and never stored.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const store = await cookies();
  const [cookieState, cookieUser, ret] = (store.get(STATE_COOKIE)?.value ?? "").split(".");
  const back = new URL(RETURN_PATHS[ret === "o" ? "o" : "a"], req.url);
  const done = (params: Record<string, string | number>) => {
    for (const [k, v] of Object.entries(params)) back.searchParams.set(k, String(v));
    const res = NextResponse.redirect(back, { status: 303 });
    res.cookies.set(STATE_COOKIE, "", { path: "/api/integrations/spotify", maxAge: 0 });
    return res;
  };

  const userId = await currentUserId();
  const queryState = url.searchParams.get("state") ?? "";
  if (!cookieState || !userId || cookieUser !== userId || !safeEqual(cookieState, queryState)) return done({ spotify: "state_mismatch" });
  if (url.searchParams.get("error")) return done({ spotify: url.searchParams.get("error") === "access_denied" ? "denied" : "failed" });

  const client = spotifyClient();
  const code = url.searchParams.get("code");
  if (!client) return done({ spotify: "not_configured" });
  if (!code) return done({ spotify: "failed" });

  const token = await exchangeCode(client, code);
  if (!token.ok) {
    log.warn("spotify.oauth", "code exchange failed", { status: token.status, error: token.error });
    return done({ spotify: "failed" });
  }
  if (!token.value.scope.split(" ").includes("user-follow-read")) return done({ spotify: "scope_missing" });

  let refs;
  try {
    refs = (await fetchSpotifyArtists(token.value.accessToken)).artists;
  } catch (err) {
    // 403 here usually means this Spotify account isn't on the app's user list (Development Mode).
    log.warn("spotify.import", "reading artists failed", { error: errorMessage(err) });
    return done({ spotify: "read_failed" });
  }
  if (refs.length === 0) return done({ spotify: "empty" });

  const started = Date.now();
  const first = await importSpotifyArtists(userId, refs, started + FOREGROUND_MS);
  const pending = first.remaining;

  after(async () => {
    try {
      if (pending.length > 0) {
        const rest = await importSpotifyArtists(userId, pending, started + FOREGROUND_MS + BACKGROUND_MS);
        log.info("spotify.import", "background import finished", { followed: rest.followed, failed: rest.failed, left: rest.remaining.length });
      }
      // Look the new artists up right away on the free sources, like a manual follow does.
      const sources = [musicBrainzEvents, ticketmasterEvents].filter((s) => s.configStatus().configured);
      if (sources.length > 0) await runDiscovery({ trigger: "user", userId, sources, timeBudgetMs: 45_000 });
    } catch (err) {
      log.warn("spotify.import", "post-import work failed", { error: errorMessage(err) });
    }
  });

  return done({ spotify: pending.length > 0 ? "importing" : "imported", n: first.followed, total: refs.length });
}
