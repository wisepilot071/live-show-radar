import { SAMPLE_ARTISTS } from "@/data/sample-artists";
import { normalizeArtistName } from "@/domain/artist-identity";
import type { Artist } from "@/domain/types";
import type { ArtistSearchAdapter } from "./contract";

/**
 * Ranks: exact name/alias (0) → name/alias prefix (1) → any word prefix (2) →
 * substring (3). Ties keep catalogue order, so same-named artists stay together
 * and are disambiguated in the UI rather than collapsed.
 */
function score(artist: Artist, q: string): number | null {
  const names = [artist.name, ...(artist.aliases ?? [])].map(normalizeArtistName);
  let best: number | null = null;
  for (const n of names) {
    let s: number | null = null;
    if (n === q) s = 0;
    else if (n.startsWith(q)) s = 1;
    else if (n.split(" ").some((w) => w.startsWith(q))) s = 2;
    else if (n.includes(q)) s = 3;
    if (s !== null && (best === null || s < best)) best = s;
  }
  return best;
}

export const sampleCatalogueSearch: ArtistSearchAdapter = {
  sourceId: "sample_catalogue",
  label: "Sample catalogue",
  async search(query, { limit }) {
    const q = normalizeArtistName(query);
    if (!q) return [];
    return SAMPLE_ARTISTS.map((artist, index) => ({ artist, index, s: score(artist, q) }))
      .filter((r): r is { artist: Artist; index: number; s: number } => r.s !== null)
      .sort((a, b) => a.s - b.s || a.index - b.index)
      .slice(0, limit)
      .map((r) => r.artist);
  },
  async suggestions({ limit }) {
    return SAMPLE_ARTISTS.slice(0, limit);
  },
};

