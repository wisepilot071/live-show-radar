import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authorizationUrl } from "@/integrations/google/calendar";
import { randomToken } from "@/server/crypto";
import { isDatabaseConfigured } from "@/server/db";
import { googleCalendarStatus, oauthClient } from "@/server/google-calendar";
import { currentUserId, isSessionConfigured } from "@/server/session";

const STATE_COOKIE = "lsr_gcal_state";

/**
 * Starts Google Calendar authorisation for the CURRENT profile. A random
 * state is stored in an httpOnly cookie and echoed by Google; the callback
 * rejects any mismatch (CSRF / login-swap protection).
 */
export async function GET(req: Request) {
  const back = new URL("/settings", req.url);
  back.hash = "connections";
  const client = oauthClient();
  if (!client || !isDatabaseConfigured() || !isSessionConfigured()) {
    back.searchParams.set("calendar", "not_configured");
    return NextResponse.redirect(back, { status: 303 });
  }
  const userId = await currentUserId();
  if (!userId) {
    back.searchParams.set("calendar", "no_profile");
    return NextResponse.redirect(back, { status: 303 });
  }
  if (!googleCalendarStatus().configured) {
    back.searchParams.set("calendar", "not_configured");
    return NextResponse.redirect(back, { status: 303 });
  }
  const state = randomToken(24);
  (await cookies()).set(STATE_COOKIE, `${state}.${userId}`, {
    httpOnly: true,
    secure: new URL(req.url).protocol === "https:",
    sameSite: "lax", // sent on Google's top-level redirect back to us
    path: "/api/integrations/google",
    maxAge: 600,
  });
  return NextResponse.redirect(authorizationUrl(client, state), { status: 303 });
}
