import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getSql } from "@/server/db";
import { log } from "@/server/log";

/**
 * Double opt-in, step 2: the link from the confirmation email. Marks the
 * address it was sent to as confirmed (only if it's still the saved address
 * and the link hasn't expired), then returns to Settings with the outcome.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const back = (outcome: string) => NextResponse.redirect(new URL(`/settings?email=${outcome}#alerts`, url), 303);
  if (!/^[A-Za-z0-9_-]{30,100}$/.test(token)) return back("link-invalid");
  try {
    const hash = createHash("sha256").update(token).digest("hex");
    const rows = await getSql()`
      update radar.user_preferences
      set email_verified_address = email_address, email_verified_at = now(),
          email_verify_token_hash = null, email_verify_expires_at = null, updated_at = now()
      where email_verify_token_hash = ${hash} and email_verify_expires_at > now() and email_address is not null
      returning user_id`;
    return back(rows.length ? "confirmed" : "link-invalid");
  } catch (err) {
    log.error("email-confirm", "confirmation failed", { error: err instanceof Error ? err.message : String(err) });
    return back("error");
  }
}
