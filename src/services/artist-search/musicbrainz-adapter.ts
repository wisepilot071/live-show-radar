import { luceneEscape, mbGet, type MbArtist } from "@/integrations/musicbrainz/client";
import { mbArtistToArtist } from "@/server/repos/artists";
import type { Artist } from "@/domain/types";
import type { ArtistSearchAdapter } from "./contract";

/**
 * Live artist search against MusicBrainz. Results carry stable MBIDs and
 * MusicBrainz's own disambiguation text, so same-named artists stay distinct.
 * A short in-memory cache keeps repeat keystrokes off the 1 req/s budget.
 */
const cache = new Map<string, { at: number; artists: Artist[] }>();
const TTL_MS = 10 * 60_000;

export const musicBrainzArtistSearch: ArtistSearchAdapter = {
  sourceId: "live",
  label: "MusicBrainz",
  async search(query, { limit }) {
    const key = `${query.toLowerCase()}|${limit}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.artists;
    const q = luceneEscape(query);
    const res = await mbGet<{ artists?: MbArtist[] }>("artist", {
      // Name/alias match, boosting exact phrase matches.
      query: `artist:"${q}"^3 OR alias:"${q}"^2 OR artist:(${q})`,
      limit: String(limit),
    });
    // MusicBrainz scores relevance 0–100; below ~70 results are mostly unrelated acts sharing a word.
    const artists = (res.artists ?? []).filter((a) => (a.score ?? 100) >= 70).map(mbArtistToArtist);
    if (cache.size > 300) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), artists });
    return artists;
  },
  // No curated "popular" list from a live catalogue — we don't invent one.
  async suggestions() {
    return [];
  },
};
