import { createUserEnteredArtist } from "@/domain/artist-identity";
import type { Artist } from "@/domain/types";
import { MusicBrainzError, mbGet, type MbRelation } from "@/integrations/musicbrainz/client";
import type { SpotifyArtistRef } from "@/integrations/spotify/client";
import { errorMessage, log } from "@/server/log";
import { followArtist } from "@/server/repos/profile";

/**
 * Follows the artists imported from Spotify.
 *
 * Each Spotify artist is matched to MusicBrainz through MusicBrainz's own
 * link from the Spotify artist URL (no name guessing), so it lands on the
 * same catalogue row as artists followed by search — never a duplicate.
 * When MusicBrainz has no link, the artist is followed by name, which
 * Ticketmaster and the news search work from. Following is idempotent, so
 * running the import again only adds what's new.
 */
export interface SpotifyImportSummary {
  followed: number;
  matchedOnMusicBrainz: number;
  byName: number;
  failed: number;
  /** Not reached within the time budget. */
  remaining: SpotifyArtistRef[];
}

async function musicBrainzIdFor(spotifyId: string, deadline: number): Promise<string | null> {
  try {
    const url = await mbGet<{ relations?: MbRelation[] }>(
      "url",
      { resource: `https://open.spotify.com/artist/${spotifyId}`, inc: "artist-rels" },
      { deadline },
    );
    return url.relations?.find((r) => r["target-type"] === "artist" && r.artist?.id)?.artist?.id ?? null;
  } catch (err) {
    // 404 = MusicBrainz has no link for this Spotify artist. Anything else: fall back to the name too.
    if (!(err instanceof MusicBrainzError && err.category === "source_bad_response")) {
      log.warn("spotify.import", "MusicBrainz lookup failed; following by name", { category: err instanceof MusicBrainzError ? err.category : "unknown" });
    }
    return null;
  }
}

export async function importSpotifyArtists(userId: string, refs: SpotifyArtistRef[], deadline: number): Promise<SpotifyImportSummary> {
  const summary: SpotifyImportSummary = { followed: 0, matchedOnMusicBrainz: 0, byName: 0, failed: 0, remaining: [] };
  const selectedAt = new Date().toISOString();
  for (const [i, ref] of refs.entries()) {
    // Each artist costs up to two MusicBrainz calls (≈1.1 s each); stop cleanly before the budget runs out.
    if (Date.now() > deadline - 3_000) {
      summary.remaining = refs.slice(i);
      break;
    }
    try {
      const mbid = await musicBrainzIdFor(ref.spotifyId, deadline);
      const artist: Artist = mbid
        ? { id: `mbid:${mbid}`, name: ref.name, externalIds: { musicbrainz: mbid }, origin: "musicbrainz" }
        : createUserEnteredArtist(ref.name);
      await followArtist(userId, { artist, addedVia: "spotify", selectedAt });
      summary.followed++;
      if (mbid) summary.matchedOnMusicBrainz++;
      else summary.byName++;
    } catch (err) {
      summary.failed++;
      log.warn("spotify.import", "could not follow an imported artist", { error: errorMessage(err) });
    }
  }
  return summary;
}
