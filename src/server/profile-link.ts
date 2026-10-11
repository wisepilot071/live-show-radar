import type { GoogleIdentity } from "@/integrations/google/calendar";
import { getSql } from "./db";

/**
 * "Sign in with Google" for an anonymous-cookie app.
 *
 * Each browser starts with its own profile. When someone connects Google on a
 * device and that Google account already belongs to ANOTHER profile, they have
 * proven ownership of that profile, so this device should use it:
 * - match by Google account id (sub) on an existing Calendar connection, or
 * - by Google-verified email equal to a profile's CONFIRMED email (clicked our
 *   link). Unconfirmed / operator-allowlisted addresses never match — otherwise
 *   anyone could type someone else's address and capture their sign-in.
 */
export async function findProfileForGoogle(identity: GoogleIdentity, currentUserId: string): Promise<string | null> {
  const sql = getSql();
  const [bySub] = await sql<{ user_id: string }[]>`
    select user_id from radar.google_calendar_connections where google_sub = ${identity.sub} and user_id <> ${currentUserId}`;
  if (bySub) return bySub.user_id;
  if (identity.email && identity.emailVerified) {
    const [byEmail] = await sql<{ user_id: string }[]>`
      select user_id from radar.user_preferences
      where lower(email_verified_address) = ${identity.email} and user_id <> ${currentUserId}
      order by updated_at desc limit 1`;
    if (byEmail) return byEmail.user_id;
  }
  return null;
}

/**
 * Copies what this device's profile has that the existing one lacks: followed
 * artists, saved shows, bookings and mutes. Nothing is deleted; conflicts keep
 * the existing profile's row. One transaction.
 */
export async function mergeProfileInto(fromUserId: string, intoUserId: string): Promise<{ artists: number; saved: number; bookings: number }> {
  return getSql().begin(async (tx) => {
    const a = await tx`
      insert into radar.user_artists (user_id, artist_id, added_via, selected_at)
      select ${intoUserId}, artist_id, added_via, selected_at from radar.user_artists where user_id = ${fromUserId}
      on conflict do nothing`;
    const s = await tx`
      insert into radar.saved_shows (user_id, event_key, event_id, snapshot, saved_at)
      select ${intoUserId}, event_key, event_id, snapshot, saved_at from radar.saved_shows where user_id = ${fromUserId}
      on conflict do nothing`;
    // Bookings move (their calendar sync then runs under the signed-in profile).
    const b = await tx`
      update radar.bookings set user_id = ${intoUserId}
      where user_id = ${fromUserId}
        and event_id not in (select event_id from radar.bookings where user_id = ${intoUserId})`;
    await tx`
      insert into radar.event_mutes (user_id, event_id)
      select ${intoUserId}, event_id from radar.event_mutes where user_id = ${fromUserId}
      on conflict do nothing`;
    return { artists: a.count, saved: s.count, bookings: b.count };
  });
}

/** A Google-verified email becomes the alert address when the profile has none (Google proved ownership). */
export async function adoptGoogleEmail(userId: string, identity: GoogleIdentity): Promise<boolean> {
  if (!identity.email || !identity.emailVerified) return false;
  const rows = await getSql()`
    insert into radar.user_preferences (user_id, email_enabled, email_address, email_verified_address, email_verified_at)
    values (${userId}, true, ${identity.email}, ${identity.email}, now())
    on conflict (user_id) do update set
      email_enabled = true, email_address = excluded.email_address,
      email_verified_address = excluded.email_verified_address, email_verified_at = now(), updated_at = now()
    where radar.user_preferences.email_address is null
       or lower(radar.user_preferences.email_address) = excluded.email_address
    returning user_id`;
  return rows.length > 0;
}
