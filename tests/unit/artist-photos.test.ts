import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARTIST_PHOTOS } from "@/data/artist-photos";
import { CURATED_ARTISTS } from "@/data/curated-artists";
import { photoForArtist, photoForName } from "@/lib/artist-photo";

describe("artist photos", () => {
  it("every photo file exists and carries licence + author + source", () => {
    for (const p of Object.values(ARTIST_PHOTOS)) {
      expect(existsSync(join("public", p.src)), p.src).toBe(true);
      expect(p.licence).toMatch(/^(CC0|Public domain|CC BY)/i);
      expect(p.author.length).toBeGreaterThan(0);
      expect(p.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
    }
  });

  it("matches by MusicBrainz id first, so a same-named different artist gets no photo", () => {
    const coldplay = CURATED_ARTISTS.find((a) => a.slug === "coldplay")!;
    expect(photoForArtist({ name: "Coldplay", externalIds: { musicbrainz: coldplay.musicbrainzId! } })?.src).toBe("/images/artists/coldplay.webp");
    expect(photoForArtist({ name: "Coldplay", externalIds: { musicbrainz: "00000000-0000-0000-0000-000000000000" } })).toBeNull();
  });

  it("DIVINE has no photo (name search matched a different person once)", () => {
    expect(ARTIST_PHOTOS.divine).toBeUndefined();
    expect(photoForName("DIVINE")).toBeNull();
  });
});
