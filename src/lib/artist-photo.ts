import { ARTIST_PHOTOS, type ArtistPhoto } from "@/data/artist-photos";
import { CURATED_ARTISTS } from "@/data/curated-artists";
import { normalizeArtistName } from "@/domain/artist-identity";

/*
 * Licensed artist photos (see scripts/fetch-artist-photos.ts). Matching is by
 * MusicBrainz id whenever we have one, so a same-named different artist never
 * gets someone else's face. Name matching is only a fallback for event cards,
 * which carry display names, and only against the curated catalogue.
 */
const byMbid = new Map<string, ArtistPhoto>();
const byName = new Map<string, ArtistPhoto>();
for (const a of CURATED_ARTISTS) {
  const photo = ARTIST_PHOTOS[a.slug];
  if (!photo) continue;
  if (a.musicbrainzId) byMbid.set(a.musicbrainzId, photo);
  byName.set(normalizeArtistName(a.name), photo);
}

export function photoForArtist(artist: { name: string; externalIds?: { musicbrainz?: string } }): ArtistPhoto | null {
  const mbid = artist.externalIds?.musicbrainz;
  if (mbid) return byMbid.get(mbid) ?? null;
  return byName.get(normalizeArtistName(artist.name)) ?? null;
}

export function photoForName(name: string): ArtistPhoto | null {
  return byName.get(normalizeArtistName(name)) ?? null;
}

export function photoCredit(p: ArtistPhoto): string {
  return `Photo: ${p.author} · ${p.licence} · Wikimedia Commons`;
}
