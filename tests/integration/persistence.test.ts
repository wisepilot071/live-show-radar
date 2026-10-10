/**
 * Integration tests against the configured Postgres database, using ONLY
 * isolated test records (random TEST users, test:-prefixed artists, the
 * "test_fixture" source). Everything created is deleted in afterAll.
 * Skipped when DATABASE_URL is not set.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAS_DB } from "./setup-env";
import type { AdapterOutcome, EventSourceAdapter, SourceArtistRef } from "@/integrations/events/contract";
import { getSql } from "@/server/db";
import { normalizeRecord } from "@/server/ingest/normalize";
import { runDiscovery } from "@/server/ingest/pipeline";
import { upsertRecord } from "@/server/ingest/upsert";
import { getEventById, listUserEvents } from "@/server/repos/events";
import { followArtist, getProfile, savePreferences, saveShow, unfollowArtist, unsaveShow } from "@/server/repos/profile";
import { fixtureRecord } from "../fixtures/source-records";

const RUN = randomUUID().slice(0, 8);
const userA = randomUUID();
const userB = randomUUID();
const artistId = randomUUID();
const artistKey = `test:${RUN}`;
const artistName = `TEST Fixture Band ${RUN}`;
const NOW = new Date().toISOString();
const ref: SourceArtistRef = { artistId, name: artistName, aliases: [] };
const SRC = { id: "test_fixture", name: "TEST fixture source", sourceClass: "listing" as const };
const SRC2 = { id: "test_fixture_2", name: "TEST fixture source 2", sourceClass: "ticketing" as const };
const rec = (o: Parameters<typeof fixtureRecord>[0] = {}) =>
  fixtureRecord({ performers: [{ name: artistName }], sourceEventId: `TEST-${RUN}-1`, ...o });

function adapter(id: string, outcome: () => AdapterOutcome, sourceClass: "listing" | "ticketing" = "listing"): EventSourceAdapter {
  return {
    id,
    name: `TEST ${id}`,
    sourceClass,
    configStatus: () => ({ configured: true }),
    canLookUp: () => true,
    fetchForArtists: async () => outcome(),
  };
}

describe.skipIf(!HAS_DB)("database integration (isolated TEST records)", () => {
  beforeAll(async () => {
    const sql = getSql();
    await sql`insert into radar.users (id) values (${userA}), (${userB})`;
    await sql`insert into radar.artists (id, catalogue_key, name, origin) values (${artistId}, ${artistKey}, ${artistName}, 'event_source')`;
    await sql`insert into radar.user_artists (user_id, artist_id, added_via) values (${userA}, ${artistId}, 'manual')`;
  });

  afterAll(async () => {
    const sql = getSql();
    await sql`delete from radar.events e using radar.event_artists ea where ea.event_id = e.id and ea.artist_id = ${artistId}`;
    await sql`delete from radar.ingestion_runs where source_id like 'test_fixture%'`;
    await sql`delete from radar.job_locks where key like ${"discovery:user:" + userA + "%"}`;
    await sql`delete from radar.users where id in (${userA}, ${userB})`;
    await sql`delete from radar.artists where id = ${artistId} or catalogue_key = ${`user:test fixture typed ${RUN}`}`;
    await sql.end({ timeout: 2 });
    globalThis.__lsrSql = undefined;
  });

  it("preferences round-trip and reject invalid values at the DB level", async () => {
    await savePreferences(userA, {
      location: { primaryCityId: "bengaluru", additionalCityIds: ["mumbai"], includeNationwide: true },
      notifications: { triggers: { new_announcement: true, outside_primary_city: false } },
      channelRequests: { email: true, telegram: false },
      method: "manual",
      spotify: "not_connected",
      completedAt: NOW,
    });
    const p = await getProfile(userA);
    expect(p.location.additionalCityIds).toEqual(["mumbai"]);
    expect(p.notifications.triggers.outside_primary_city).toBe(false);
    expect(p.completedAt).not.toBeNull();
    await expect(getSql()`update radar.user_preferences set acquisition_method = 'hack' where user_id = ${userA}`).rejects.toThrow();
  });

  it("follows are idempotent and removable; other users can't see them", async () => {
    const sel = { artist: { id: "x", name: `TEST Fixture Typed ${RUN}`, origin: "user_entered" as const }, addedVia: "manual" as const, selectedAt: NOW };
    const a = await followArtist(userA, sel);
    await followArtist(userA, sel);
    const pA = await getProfile(userA);
    expect(pA.selections.filter((s) => s.artist.id === a.artist.id)).toHaveLength(1);
    expect((await getProfile(userB)).selections).toHaveLength(0);
    expect(await unfollowArtist(userB, a.artist.id)).toBe(false); // B can't remove A's follow
    expect(await unfollowArtist(userA, a.artist.id)).toBe(true);
    expect((await getProfile(userA)).selections.some((s) => s.artist.id === a.artist.id)).toBe(false);
  });

  it("re-ingesting the same source record is idempotent", async () => {
    const n = normalizeRecord(rec(), SRC, [ref]);
    if (!n.ok) throw new Error(n.reason);
    const first = await upsertRecord(getSql(), n.record);
    const second = await upsertRecord(getSql(), n.record);
    expect(first.outcome).toBe("new");
    expect(second.outcome).toBe("unchanged");
    expect(second.eventId).toBe(first.eventId);
    const [row] = await getSql()<{ count: string }[]>`select count(*) from radar.event_sources where event_id = ${first.eventId}`;
    expect(Number(row?.count)).toBe(1);
  });

  it("same show from another source (same venue) merges as extra evidence; a changed date is logged", async () => {
    const n = normalizeRecord(rec({ sourceEventId: `TEST-${RUN}-tm`, ticket: { status: "on_sale", sourceExposesAvailability: true } }), SRC2, [ref]);
    if (!n.ok) throw new Error(n.reason);
    const merged = await upsertRecord(getSql(), n.record);
    expect(merged.outcome).toBe("updated");
    const ev = await getEventById(merged.eventId, userA);
    expect(ev?.sources?.map((s) => s.sourceId).sort()).toEqual(["test_fixture", "test_fixture_2"]);
    expect(ev?.ticket.kind).toBe("on_sale");

    const moved = normalizeRecord(rec({ localDate: "2027-02-14", localTime: "19:30" }), SRC, [ref]);
    if (!moved.ok) throw new Error(moved.reason);
    const res = await upsertRecord(getSql(), moved.record);
    expect(res.outcome).toBe("updated");
    const changes = await getSql()<{ change_type: string; field: string | null }[]>`
      select change_type, field from radar.event_changes where event_id = ${res.eventId}`;
    expect(changes.some((c) => c.change_type === "conflict" && c.field === "localDate")).toBe(true);
  });

  it("same artist/date/city but a different venue stays separate and is flagged", async () => {
    const n = normalizeRecord(rec({ sourceEventId: `TEST-${RUN}-other`, venueName: "TEST Other Venue", localDate: "2027-03-01" }), SRC, [ref]);
    const m = normalizeRecord(rec({ sourceEventId: `TEST-${RUN}-other-2`, venueName: "TEST Third Venue", localDate: "2027-03-01" }), SRC2, [ref]);
    if (!n.ok || !m.ok) throw new Error("fixture invalid");
    const a = await upsertRecord(getSql(), n.record);
    const b = await upsertRecord(getSql(), m.record);
    expect(b.eventId).not.toBe(a.eventId);
    expect(b.duplicateCandidate).toBe(true);
  });

  it("a user's pasted (private) event is invisible to other users and never merges", async () => {
    const n = normalizeRecord(rec({ sourceEventId: `TEST-${RUN}-private` }), { id: "announcement", name: "TEST paste", sourceClass: "user_submitted" }, [ref], userA);
    if (!n.ok) throw new Error(n.reason);
    const res = await upsertRecord(getSql(), n.record);
    expect(res.outcome).toBe("new"); // did not attach to the public event with the same artist/date/city/venue
    expect(await getEventById(res.eventId, userA)).not.toBeNull();
    expect(await getEventById(res.eventId, userB)).toBeNull();
    expect(await getEventById(res.eventId, null)).toBeNull();
    await getSql()`insert into radar.user_artists (user_id, artist_id, added_via) values (${userB}, ${artistId}, 'manual') on conflict do nothing`;
    expect((await listUserEvents(userB, {})).some((e) => e.id === res.eventId)).toBe(false);
    expect((await listUserEvents(userA, {})).some((e) => e.id === res.eventId)).toBe(true);
  });

  it("saved shows: duplicate saves are no-ops; unsave removes only your own", async () => {
    const [ev] = await listUserEvents(userA, {});
    if (!ev) throw new Error("no event");
    await saveShow(userA, ev.id, ev, NOW);
    await saveShow(userA, ev.id, ev, NOW);
    expect((await getProfile(userA)).savedEvents.filter((s) => s.eventId === ev.id)).toHaveLength(1);
    expect(await unsaveShow(userB, ev.id)).toBe(false);
    expect(await unsaveShow(userA, ev.id)).toBe(true);
  });

  it("discovery: one failing source doesn't block another; runs are recorded honestly", async () => {
    const ok = adapter("test_fixture", () => ({
      ok: true,
      records: [rec({ sourceEventId: `TEST-${RUN}-run`, localDate: "2027-04-01" })],
      checkedArtistIds: [artistId],
      artistFailures: [],
    }));
    const broken = adapter("test_fixture_down", () => ({ ok: false, category: "source_unavailable", message: "TEST outage" }));
    const result = await runDiscovery({ trigger: "user", userId: userA, sources: [broken, ok] });
    expect(result.status).toBe("completed");
    if (result.status !== "completed") return;
    const byId = Object.fromEntries(result.sources.map((s) => [s.sourceId, s]));
    expect(byId.test_fixture_down?.status).toBe("failed");
    expect(byId.test_fixture_down?.errorCategory).toBe("source_unavailable");
    expect(byId.test_fixture?.status).toBe("succeeded");
    expect(byId.test_fixture?.eventsNew).toBe(1);
    // Incremental: the same artists aren't due again immediately.
    const again = await runDiscovery({ trigger: "user", userId: userA, sources: [ok] });
    expect(again.status === "completed" && again.sources[0]?.status).toBe("skipped");
  });

  it("overlapping runs for the same scope: a held lease refuses a second run", async () => {
    const sql = getSql();
    const key = `discovery:user:${userA}`;
    await sql`insert into radar.job_locks (key, holder, expires_at) values (${key}, 'TEST-holder', now() + interval '1 minute')`;
    try {
      const blocked = await runDiscovery({ trigger: "user", userId: userA, sources: [adapter("test_fixture", () => ({ ok: true, records: [], checkedArtistIds: [], artistFailures: [] }))] });
      expect(blocked.status).toBe("locked");
    } finally {
      await sql`delete from radar.job_locks where key = ${key} and holder = 'TEST-holder'`;
    }
    // An expired lease (a crashed run) is taken over rather than blocking forever.
    await sql`insert into radar.job_locks (key, holder, expires_at) values (${key}, 'TEST-crashed', now() - interval '1 minute')`;
    const resumed = await runDiscovery({ trigger: "user", userId: userA, sources: [adapter("test_fixture", () => ({ ok: true, records: [], checkedArtistIds: [], artistFailures: [] }))] });
    expect(resumed.status).toBe("completed");
  });
});
