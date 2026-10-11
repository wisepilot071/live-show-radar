import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CALENDAR_SCOPE, exchangeCode } from "@/integrations/google/calendar";
import { syncBookingCalendar } from "@/server/bookings";
import { safeEqual } from "@/server/crypto";
import { getSql } from "@/server/db";
import { oauthClient, saveConnection } from "@/server/google-calendar";
import { errorMessage, log } from "@/server/log";
import { adoptGoogleEmail, findProfileForGoogle, mergeProfileInto } from "@/server/profile-link";
import { currentUserId, switchSession } from "@/server/session";

const STATE_COOKIE = "lsr_gcal_state";

/**
 * OAuth redirect URI: <APP_BASE_URL>/api/integrations/google/callback
 * Verifies state (cookie vs query, bound to the same profile), exchanges the
 * code server-side, stores tokens encrypted, then adds any of the profile's
 * bookings that weren't on the calendar yet. Never echoes tokens.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = new URL("/settings", req.url);
  back.hash = "connections";
  const done = (result: string) => {
    back.searchParams.set("calendar", result);
    const res = NextResponse.redirect(back, { status: 303 });
    res.cookies.set(STATE_COOKIE, "", { path: "/api/integrations/google", maxAge: 0 });
    return res;
  };

  const store = await cookies();
  const [cookieState, cookieUser] = (store.get(STATE_COOKIE)?.value ?? "").split(".");
  const userId = await currentUserId();
  const queryState = url.searchParams.get("state") ?? "";
  if (!cookieState || !userId || cookieUser !== userId || !safeEqual(cookieState, queryState)) return done("state_mismatch");
  if (url.searchParams.get("error")) return done("denied");

  const client = oauthClient();
  const code = url.searchParams.get("code");
  if (!client) return done("not_configured");
  if (!code) return done("failed");

  const tokens = await exchangeCode(client, code);
  if (!tokens.ok) {
    log.warn("google.oauth", "code exchange failed", { status: tokens.status, kind: tokens.kind });
    return done("failed");
  }
  if (!tokens.value.scope.includes(CALENDAR_SCOPE)) return done("scope_missing");

  // Same Google account already owns another profile (e.g. your laptop)? This device
  // switches to it, bringing along anything new from here. Nothing is deleted.
  let profileId = userId;
  let linked = false;
  const identity = tokens.value.identity;
  if (identity) {
    try {
      const existing = await findProfileForGoogle(identity, userId);
      if (existing) {
        await mergeProfileInto(userId, existing);
        await switchSession(existing);
        profileId = existing;
        linked = true;
      }
    } catch (err) {
      log.error("google.oauth", "profile link failed", { error: errorMessage(err) });
    }
  }
  await saveConnection(profileId, tokens.value);
  // No alert email yet? Use the Google-verified address (Google proved ownership).
  if (identity) await adoptGoogleEmail(profileId, identity).catch(() => false);

  // Catch up bookings recorded before Calendar was connected (bounded; failures stay retryable).
  try {
    const pending = await getSql()<{ id: string }[]>`
      select id from radar.bookings where user_id = ${profileId} and calendar_status in ('not_connected', 'needs_reauth', 'failed')
      order by confirmed_at desc limit 10`;
    for (const b of pending) await syncBookingCalendar(profileId, b.id);
  } catch (err) {
    log.error("google.oauth", "post-connect sync failed", { error: errorMessage(err) });
  }
  return done(linked ? "linked" : "connected");
}
