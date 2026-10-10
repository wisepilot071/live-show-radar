import { z } from "zod";
import { artistIdentityKey } from "@/domain/artist-identity";
import type { ArtistSelection, LiveEvent, SavedEvent } from "@/domain/types";
import { initialOnboardingState, ONBOARDING_STATE_VERSION, type OnboardingState } from "@/features/onboarding/state";
import { getSql } from "@/server/db";
import { rowToArtist, upsertCatalogueArtist, type ArtistRow } from "./artists";
import { getEventById } from "./events";

/**
 * The user's radar profile, stored relationally and returned in the exact
 * OnboardingState shape the client reducer already uses — so the UI needs
 * no new data model. Every query is scoped by the caller's userId.
 */

export const preferencesSchema = z.object({
  location: z.object({
    primaryCityId: z.string().min(1).max(40),
    additionalCityIds: z.array(z.string().min(1).max(40)).max(20),
    includeNationwide: z.boolean(),
  }),
  notifications: z.object({ triggers: z.record(z.string().max(40), z.boolean()) }),
  channelRequests: z.object({ email: z.boolean(), telegram: z.boolean() }),
  method: z.enum(["spotify", "manual", "mix"]).nullable(),
  spotify: z.string().max(40),
  completedAt: z.string().datetime({ offset: true }).nullable(),
});
export type PreferencesInput = z.infer<typeof preferencesSchema>;

interface PrefRow {
  primary_city_id: string;
  additional_city_ids: string[];
  include_nationwide: boolean;
  alert_triggers: Record<string, boolean>;
  channel_requests: Record<string, boolean>;
  acquisition_method: OnboardingState["method"];
  spotify_status: string;
  onboarding_completed_at: Date | null;
  updated_at: Date;
}

export async function getProfile(userId: string): Promise<OnboardingState> {
  const sql = getSql();
  const [prefs] = await sql<PrefRow[]>`select * from radar.user_preferences where user_id = ${userId}`;
  const artists = await sql<(ArtistRow & { added_via: "manual" | "spotify"; selected_at: Date })[]>`
    select a.*, ua.added_via, ua.selected_at from radar.user_artists ua
    join radar.artists a on a.id = ua.artist_id
    where ua.user_id = ${userId} order by ua.selected_at`;
  const saved = await sql<{ event_key: string; event_id: string | null; snapshot: LiveEvent; saved_at: Date }[]>`
    select event_key, event_id, snapshot, saved_at from radar.saved_shows where user_id = ${userId} order by saved_at`;

  const savedEvents: SavedEvent[] = [];
  for (const s of saved) {
    // Prefer the live canonical record; fall back to the snapshot if it's gone.
    const live = s.event_id ? await getEventById(s.event_id, userId) : null;
    savedEvents.push({ eventId: s.event_key, savedAt: s.saved_at.toISOString(), snapshot: live ?? s.snapshot });
  }

  const d = initialOnboardingState;
  return {
    version: ONBOARDING_STATE_VERSION,
    method: prefs?.acquisition_method ?? null,
    selections: artists.map<ArtistSelection>((r) => ({
      artist: rowToArtist(r),
      addedVia: r.added_via,
      selectedAt: r.selected_at.toISOString(),
    })),
    spotify: (prefs?.spotify_status as OnboardingState["spotify"]) ?? d.spotify,
    location: prefs
      ? {
          primaryCityId: prefs.primary_city_id,
          additionalCityIds: prefs.additional_city_ids,
          includeNationwide: prefs.include_nationwide,
        }
      : d.location,
    notifications: { triggers: { ...d.notifications.triggers, ...(prefs?.alert_triggers ?? {}) } },
    channelRequests: { ...d.channelRequests, ...(prefs?.channel_requests ?? {}) },
    savedEvents,
    completedAt: prefs?.onboarding_completed_at?.toISOString() ?? null,
    updatedAt: prefs?.updated_at.toISOString() ?? null,
  };
}

export async function savePreferences(userId: string, p: PreferencesInput): Promise<void> {
  const sql = getSql();
  await sql`
    insert into radar.user_preferences
      (user_id, primary_city_id, additional_city_ids, include_nationwide, alert_triggers, channel_requests,
       acquisition_method, spotify_status, onboarding_completed_at)
    values
      (${userId}, ${p.location.primaryCityId}, ${p.location.additionalCityIds}, ${p.location.includeNationwide},
       ${sql.json(p.notifications.triggers)}, ${sql.json(p.channelRequests)}, ${p.method}, ${p.spotify}, ${p.completedAt})
    on conflict (user_id) do update set
      primary_city_id = excluded.primary_city_id, additional_city_ids = excluded.additional_city_ids,
      include_nationwide = excluded.include_nationwide, alert_triggers = excluded.alert_triggers,
      channel_requests = excluded.channel_requests, acquisition_method = excluded.acquisition_method,
      spotify_status = excluded.spotify_status, onboarding_completed_at = excluded.onboarding_completed_at,
      updated_at = now()`;
}

/* ── Followed artists ── */

export async function followArtist(userId: string, selection: ArtistSelection): Promise<ArtistSelection> {
  const sql = getSql();
  const { rowId, artist } = await upsertCatalogueArtist(selection.artist, sql);
  // Primary key (user_id, artist_id) makes duplicate follows impossible.
  await sql`
    insert into radar.user_artists (user_id, artist_id, added_via, selected_at)
    values (${userId}, ${rowId}, ${selection.addedVia}, ${selection.selectedAt})
    on conflict (user_id, artist_id) do nothing`;
  return { ...selection, artist };
}

export async function unfollowArtist(userId: string, identityKey: string): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    delete from radar.user_artists ua using radar.artists a
    where ua.artist_id = a.id and ua.user_id = ${userId} and a.catalogue_key = ${identityKey}
    returning ua.artist_id`;
  return rows.length > 0;
}

/** Replace one followed artist with another atomically (typed name → catalogue match). */
export async function replaceArtist(userId: string, fromKey: string, selection: ArtistSelection): Promise<ArtistSelection> {
  const sql = getSql();
  const { rowId, artist } = await upsertCatalogueArtist(selection.artist, sql);
  await sql.begin(async (tx) => {
    const [old] = await tx<{ selected_at: Date; added_via: string }[]>`
      delete from radar.user_artists ua using radar.artists a
      where ua.artist_id = a.id and ua.user_id = ${userId} and a.catalogue_key = ${fromKey}
      returning ua.selected_at, ua.added_via`;
    await tx`
      insert into radar.user_artists (user_id, artist_id, added_via, selected_at)
      values (${userId}, ${rowId}, ${old?.added_via ?? selection.addedVia}, ${old?.selected_at ?? selection.selectedAt})
      on conflict (user_id, artist_id) do nothing`;
  });
  return { ...selection, artist };
}

export async function clearArtists(userId: string): Promise<void> {
  await getSql()`delete from radar.user_artists where user_id = ${userId}`;
}

/* ── Saved shows ── */

export async function saveShow(userId: string, eventKey: string, snapshot: LiveEvent, savedAt: string): Promise<void> {
  const sql = getSql();
  const isCanonical = /^[0-9a-f-]{36}$/.test(eventKey);
  const [exists] = isCanonical ? await sql`select id from radar.events where id = ${eventKey}` : [];
  await sql`
    insert into radar.saved_shows (user_id, event_key, event_id, snapshot, saved_at)
    values (${userId}, ${eventKey}, ${exists ? eventKey : null}, ${sql.json(snapshot as never)}, ${savedAt})
    on conflict (user_id, event_key) do nothing`;
}

export async function unsaveShow(userId: string, eventKey: string): Promise<boolean> {
  const rows = await getSql()`delete from radar.saved_shows where user_id = ${userId} and event_key = ${eventKey} returning event_key`;
  return rows.length > 0;
}

/* ── Whole profile ── */

/** One-time move of a browser draft into the server profile (only if the server profile is empty). */
export async function importDraft(userId: string, draft: OnboardingState): Promise<{ imported: boolean; skippedArtists: number }> {
  const sql = getSql();
  const [{ count } = { count: 0 }] = await sql<{ count: number }[]>`
    select (select count(*) from radar.user_artists where user_id = ${userId})
         + (select count(*) from radar.saved_shows where user_id = ${userId})
         + (select count(*) from radar.user_preferences where user_id = ${userId}) as count`;
  if (Number(count) > 0) return { imported: false, skippedArtists: 0 };

  await savePreferences(userId, {
    location: draft.location,
    notifications: { triggers: draft.notifications.triggers },
    channelRequests: draft.channelRequests,
    method: draft.method,
    spotify: draft.spotify,
    completedAt: draft.completedAt,
  });
  let skipped = 0;
  const seen = new Set<string>();
  for (const sel of draft.selections) {
    const key = artistIdentityKey(sel.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      await followArtist(userId, sel);
    } catch {
      skipped++; // e.g. an artist record that no longer validates
    }
  }
  for (const s of draft.savedEvents) await saveShow(userId, s.eventId, s.snapshot, s.savedAt);
  return { imported: true, skippedArtists: skipped };
}

export async function deleteProfile(userId: string): Promise<void> {
  const sql = getSql();
  await sql.begin(async (tx) => {
    // Cascades remove the user's prefs, follows, saved shows and private evidence rows…
    await tx`delete from radar.users where id = ${userId}`;
    // …then drop events that no longer have any evidence at all.
    await tx`delete from radar.events e where not exists (select 1 from radar.event_sources s where s.event_id = e.id)`;
  });
}
