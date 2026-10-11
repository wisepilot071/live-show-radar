/**
 * Curated catalogue against the real database with ISOLATED TEST profiles.
 * Re-runs the seed migration (idempotency), exercises the catalogue route,
 * follow/unfollow through the existing repo, ownership, and the discovery
 * pipeline's artist selection with a fixture source (no external calls).
 * Test profiles and the fixture's run records are deleted afterwards; the
 * seeded catalogue itself is real data and stays.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAS_DB } from "./setup-env";
import { GET as catalogueGET } from "@/app/api/artists/catalogue/route";
import type { CatalogueEntry } from "@/app/api/artists/catalogue/route";
import type { AdapterOutcome, EventSourceAdapter, SourceArtistRef } from "@/integrations/events/contract";
import { getSql } from "@/server/db";
import { runDiscovery } from "@/server/ingest/pipeline";
import { followArtist, getProfile, unfollowArtist } from "@/server/repos/profile";

const RUN = randomUUID().slice(0, 8);
const karan = randomUUID();
const other = randomUUID();
const seed = readFileSync(new URL("../../db/migrations/0007_seed_curated_artists.sql", import.meta.url), "utf8");

async function catalogue(qs = ""): Promise<CatalogueEntry[]> {
  const res = await catalogueGET(new Request(`http://localhost/api/artists/catalogue${qs}`));
  const body = (await res.json()) as { ok: boolean; data: { entries: CatalogueEntry[] } };
  expect(body.ok).toBe(true);
  return body.data.entries;
}

describe.skipIf(!HAS_DB)("curated artist catalogue (real DB, isolated TEST profiles)", () => {
  beforeAll(async () => {
    await getSql()`insert into radar.users (id) values (${karan}), (${other})`;
  });
  afterAll(async () => {
    const sql = getSql();
    await sql`delete from radar.users where id in (${karan}, ${other})`;
    await sql`delete from radar.ingestion_runs where source_id = ${`test_fixture_curated_${RUN}`}`;
    await sql`delete from radar.artist_source_checks where source_id = ${`test_fixture_curated_${RUN}`}`;
    await sql.end({ timeout: 2 });
    globalThis.__lsrSql = undefined;
  });

  it("seed is idempotent: running it again changes no counts", async () => {
    const sql = getSql();
    const count = async () =>
      (await sql<{ artists: number; entries: number; unique_listed: number }[]>`
        select (select count(*)::int from radar.artists) as artists,
               (select count(*)::int from radar.curated_artist_lists) as entries,
               (select count(distinct artist_id)::int from radar.curated_artist_lists) as unique_listed`)[0]!;
    const before = await count();
    await sql.unsafe(seed);
    await sql.unsafe(seed);
    expect(await count()).toEqual(before);
    expect(before.entries).toBe(50);
    expect(before.unique_listed).toBe(46);
  });

  it("catalogue route: 46 artists, category filters, search", async () => {
    expect(await catalogue()).toHaveLength(46);
    const intl = await catalogue("?category=international");
    const indian = await catalogue("?category=indian");
    expect(intl.length + indian.length).toBe(46);
    expect(intl.every((e) => e.category === "international")).toBe(true);
    expect((await catalogue("?q=papon")).map((e) => e.artist.name)).toEqual(["Papon"]);
    expect(await catalogue("?q=zzzz-no-such-artist")).toEqual([]);
    const papon = (await catalogue("?q=papon"))[0]!;
    expect(papon.lists.sort()).toEqual(["bengaluru_discovery_test", "karan_watchlist_suggestions"]); // one identity, both lists
  });

  it("nobody follows anything just because it's in the catalogue", async () => {
    expect((await getProfile(karan)).selections).toEqual([]);
  });

  it("add / remove / persist / owner-only — including an artist without an external id (DIVINE)", async () => {
    const entries = await catalogue();
    const pick = (name: string) => entries.find((e) => e.artist.name === name)!.artist;
    const at = new Date().toISOString();
    await followArtist(karan, { artist: pick("Prateek Kuhad"), addedVia: "manual", selectedAt: at });
    await followArtist(karan, { artist: pick("DIVINE"), addedVia: "manual", selectedAt: at });
    await followArtist(karan, { artist: pick("Prateek Kuhad"), addedVia: "manual", selectedAt: at }); // duplicate → no-op
    let p = await getProfile(karan); // a fresh read = what a refresh / new session sees
    expect(p.selections.map((s) => s.artist.name).sort()).toEqual(["DIVINE", "Prateek Kuhad"]);
    expect((await getProfile(other)).selections).toEqual([]);
    // Same identity as the MusicBrainz search result: no duplicate catalogue rows.
    const [dupes] = await getSql()<{ n: number }[]>`select count(*)::int as n from radar.artists where lower(name) = 'prateek kuhad' and origin <> 'sample_catalogue'`;
    expect(dupes?.n).toBe(1);
    // Another profile can't remove Karan's follow.
    expect(await unfollowArtist(other, pick("DIVINE").id)).toBe(false);
    expect(await unfollowArtist(karan, pick("DIVINE").id)).toBe(true);
    p = await getProfile(karan);
    expect(p.selections.map((s) => s.artist.name)).toEqual(["Prateek Kuhad"]);
  });

  it("discovery asks sources about exactly the selected list; an empty provider result is a success with 0 events", async () => {
    const asked: string[] = [];
    const fixture: EventSourceAdapter = {
      id: `test_fixture_curated_${RUN}`,
      name: "TEST curated fixture",
      sourceClass: "listing",
      configStatus: () => ({ configured: true }),
      canLookUp: () => true,
      fetchForArtists: async (artists: SourceArtistRef[]): Promise<AdapterOutcome> => {
        asked.push(...artists.map((a) => a.name));
        return { ok: true, records: [], checkedArtistIds: artists.map((a) => a.artistId), artistFailures: [] };
      },
    };
    const r = await runDiscovery({ trigger: "admin", artistListKey: "bengaluru_discovery_test", sources: [fixture], maxArtistsPerSource: 50 });
    expect(r.status).toBe("completed");
    expect(asked.sort()).toEqual(
      ["Darshan Raval", "Dhvani Bhanushali", "Diljit Dosanjh", "Guns N’ Roses", "Indian Ocean", "Krishna Das", "Papon", "Satinder Sartaaj", "Shreya Ghoshal", "Sonu Nigam"].sort(),
    );
    if (r.status === "completed") expect(r.sources[0]).toMatchObject({ status: "succeeded", recordsReturned: 0, eventsNew: 0 });
  });
});
