import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CURATED_ARTISTS, CURATED_LIST_ENTRIES, catalogueKeyOf } from "@/data/curated-artists";

/** The 50 requested entries → 46 unique artists, and the seed migration matches the data. */

describe("curated artist data", () => {
  it("50 list entries in order: 40 suggestions (1–40) + 10 discovery test targets (41–50)", () => {
    expect(CURATED_LIST_ENTRIES).toHaveLength(50);
    expect(CURATED_LIST_ENTRIES.map((e) => e.position)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(CURATED_LIST_ENTRIES.filter((e) => e.list === "karan_watchlist_suggestions")).toHaveLength(40);
    expect(CURATED_LIST_ENTRIES.filter((e) => e.list === "bengaluru_discovery_test")).toHaveLength(10);
    expect(CURATED_LIST_ENTRIES[0]?.entryName).toBe("Coldplay");
    expect(CURATED_LIST_ENTRIES[49]?.entryName).toBe("Indian Ocean");
  });

  it("46 unique identities; exactly Sonu Nigam, Papon, Shreya Ghoshal, Diljit Dosanjh appear twice", () => {
    expect(CURATED_ARTISTS).toHaveLength(46);
    expect(new Set(CURATED_ARTISTS.map((a) => a.slug)).size).toBe(46);
    expect(new Set(CURATED_ARTISTS.map(catalogueKeyOf)).size).toBe(46);
    const counts = new Map<string, number>();
    for (const e of CURATED_LIST_ENTRIES) counts.set(e.slug, (counts.get(e.slug) ?? 0) + 1);
    const twice = [...counts.entries()].filter(([, n]) => n === 2).map(([s]) => s).sort();
    expect(twice).toEqual(["diljit-dosanjh", "papon", "shreya-ghoshal", "sonu-nigam"]);
    expect(counts.size).toBe(46);
    // Every list entry resolves to a catalogue artist.
    const slugs = new Set(CURATED_ARTISTS.map((a) => a.slug));
    expect(CURATED_LIST_ENTRIES.every((e) => slugs.has(e.slug))).toBe(true);
  });

  it("categories: 20 international + 20 Indian suggestions; test targets categorised too", () => {
    const bySlug = new Map(CURATED_ARTISTS.map((a) => [a.slug, a]));
    const suggestions = CURATED_LIST_ENTRIES.filter((e) => e.list === "karan_watchlist_suggestions").map((e) => bySlug.get(e.slug)!);
    expect(suggestions.slice(0, 20).every((a) => a.category === "international")).toBe(true);
    expect(suggestions.slice(20).every((a) => a.category === "indian")).toBe(true);
    expect(bySlug.get("guns-n-roses")?.category).toBe("international");
    expect(bySlug.get("indian-ocean")?.category).toBe("indian");
  });

  it("external ids are real-format MusicBrainz ids, unique, and absent rather than guessed (DIVINE)", () => {
    const ids = CURATED_ARTISTS.map((a) => a.musicbrainzId).filter((x): x is string => x !== null);
    expect(ids).toHaveLength(45);
    expect(new Set(ids).size).toBe(45);
    expect(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))).toBe(true);
    expect(CURATED_ARTISTS.find((a) => a.slug === "divine")).toMatchObject({ musicbrainzId: null, country: null });
  });

  it("seed migration 0007 is in sync with the data (46 artist rows, 50 list rows)", () => {
    const sql = readFileSync(new URL("../../db/migrations/0007_seed_curated_artists.sql", import.meta.url), "utf8");
    const [artistBlock, listBlock] = sql.split("insert into radar.curated_artist_lists");
    for (const a of CURATED_ARTISTS) {
      expect(artistBlock!.split(`('${catalogueKeyOf(a)}',`).length - 1).toBe(1);
    }
    expect((listBlock!.match(/\('(karan_watchlist_suggestions|bengaluru_discovery_test)', \d+,/g) ?? []).length).toBe(50);
    expect(sql).toContain("on conflict (catalogue_key) do update set category = excluded.category");
    expect(sql).toContain("on conflict (list_key, position) do update");
  });
});
