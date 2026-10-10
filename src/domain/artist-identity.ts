import type { Artist, ArtistSelection } from "./types";

/**
 * Normalises a name for matching: case-folded, accents stripped, "&"→"and",
 * punctuation collapsed to single spaces, leading "the " removed.
 * Used for search matching and for the fallback identity of user-entered names.
 */
export function normalizeArtistName(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the /, "");
}

export function slugify(raw: string): string {
  return normalizeArtistName(raw).replace(/ /g, "-");
}

/**
 * Identity key used for de-duplication.
 *
 * 1. External ids win (a Spotify id from import and from search must merge).
 * 2. Otherwise the internal stable id (`sample:…`).
 * 3. User-entered names have no stable id; their key is `user:<normalised name>`.
 *    They are intentionally NOT merged with catalogue artists that share the
 *    name, because a typed name may refer to a different, same-named act.
 */
export function artistIdentityKey(artist: Artist): string {
  if (artist.externalIds?.spotify) return `spotify:${artist.externalIds.spotify}`;
  if (artist.externalIds?.musicbrainz) return `mbid:${artist.externalIds.musicbrainz}`;
  if (artist.origin === "user_entered") return `user:${normalizeArtistName(artist.name)}`;
  return artist.id;
}

export function isSameArtist(a: Artist, b: Artist): boolean {
  return artistIdentityKey(a) === artistIdentityKey(b);
}

export function createUserEnteredArtist(name: string): Artist {
  const clean = name.trim().replace(/\s+/g, " ");
  return {
    id: `user:${slugify(clean)}`,
    name: clean,
    origin: "user_entered",
  };
}

/** Adds selections, ignoring any whose identity is already present. */
export function mergeSelections(
  existing: ArtistSelection[],
  incoming: ArtistSelection[],
): ArtistSelection[] {
  const seen = new Set(existing.map((s) => artistIdentityKey(s.artist)));
  const merged = [...existing];
  for (const sel of incoming) {
    const key = artistIdentityKey(sel.artist);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(sel);
  }
  return merged;
}

export function initialsFor(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w, i, arr) => !(i === 0 && arr.length > 1 && /^the$/i.test(w)));
  const first = words[0]?.[0] ?? "?";
  const second = words[1]?.[0] ?? "";
  return (first + second).toUpperCase();
}
