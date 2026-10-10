import { describe, expect, it } from "vitest";
import { matchIndianCity, withinIndiaBounds } from "@/domain/cities";
import { isValidTimeZone, zonedToUtcIso } from "@/lib/zoned-time";
import { normalizeRecord, venueKey } from "@/server/ingest/normalize";
import { comparable, mergeEvidence } from "@/server/ingest/upsert";
import { fixtureRecord, TEST_ARTIST, TEST_ARTIST_2 } from "../fixtures/source-records";

const MB = { id: "musicbrainz", name: "MusicBrainz", sourceClass: "community" as const };
const TM = { id: "ticketmaster", name: "Ticketmaster", sourceClass: "ticketing" as const };

describe("zoned time", () => {
  it("converts IST wall-clock to UTC", () => {
    expect(zonedToUtcIso("2027-02-13", "19:30", "Asia/Kolkata")).toBe("2027-02-13T14:00:00.000Z");
  });
  it("handles the day boundary (00:30 IST is the previous UTC day)", () => {
    expect(zonedToUtcIso("2027-01-01", "00:30", "Asia/Kolkata")).toBe("2026-12-31T19:00:00.000Z");
  });
  it("applies DST for zones that have it", () => {
    expect(zonedToUtcIso("2026-07-01", "20:00", "Europe/London")).toBe("2026-07-01T19:00:00.000Z");
    expect(zonedToUtcIso("2026-12-01", "20:00", "Europe/London")).toBe("2026-12-01T20:00:00.000Z");
  });
  it("rejects bad input instead of guessing", () => {
    expect(zonedToUtcIso("2027-02-30x", "19:30", "Asia/Kolkata")).toBeUndefined();
    expect(zonedToUtcIso("2027-02-13", "7pm", "Asia/Kolkata")).toBeUndefined();
    expect(zonedToUtcIso("2027-02-13", "19:30", "Mars/Olympus")).toBeUndefined();
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
  });
});

describe("cities", () => {
  it("matches aliases deterministically", () => {
    expect(matchIndianCity("Bangalore")?.id).toBe("bengaluru");
    expect(matchIndianCity("  BOMBAY ")?.id).toBe("mumbai");
    expect(matchIndianCity("Gurgaon")?.id).toBe("gurugram");
    expect(matchIndianCity("New Delhi")?.id).toBe("delhi");
  });
  it("returns undefined for unknown places", () => {
    expect(matchIndianCity("Kathmandu")).toBeUndefined();
    expect(matchIndianCity("")).toBeUndefined();
  });
  it("India bounding box", () => {
    expect(withinIndiaBounds(12.97, 77.59)).toBe(true); // Bengaluru
    expect(withinIndiaBounds(51.5, -0.12)).toBe(false); // London
  });
});

describe("normalizeRecord", () => {
  it("normalises a valid record: city alias, IST time, match key", () => {
    const r = normalizeRecord(fixtureRecord(), MB, [TEST_ARTIST]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.record.fields.cityId).toBe("bengaluru");
    expect(r.record.fields.cityName).toBe("Bengaluru");
    expect(r.record.fields.startsAt).toBe("2027-02-13T14:00:00.000Z");
    expect(r.record.fields.locationConfidence).toBe("matched_city");
    expect(r.record.artistIds).toEqual([TEST_ARTIST.artistId]);
    expect(r.record.matchKeys).toEqual([`${TEST_ARTIST.artistId}|2027-02-13|bengaluru`]);
    expect(r.record.submittedBy).toBeNull();
  });

  it("keeps a source's 'unknown' ticket status when it doesn't expose availability", () => {
    const r = normalizeRecord(fixtureRecord({ ticket: { status: "on_sale", sourceExposesAvailability: false } }), MB, [TEST_ARTIST]);
    expect(r.ok && r.record.fields.ticketStatus).toBe("unknown");
  });

  it("matches performers by exact alias but never ambiguously", () => {
    const alias = normalizeRecord(fixtureRecord({ performers: [{ name: "tfb" }] }), MB, [TEST_ARTIST]);
    expect(alias.ok).toBe(true);
    const twin = { ...TEST_ARTIST_2, name: "TEST Fixture Band", artistId: "00000000-0000-4000-8000-0000000000a3" };
    const ambiguous = normalizeRecord(fixtureRecord({ performers: [{ name: "TEST Fixture Band" }] }), MB, [{ ...TEST_ARTIST, musicbrainzId: undefined }, twin]);
    expect(ambiguous.ok).toBe(false);
  });

  it("rejects records with no followed performer, bad dates, or offset-less instants", () => {
    expect(normalizeRecord(fixtureRecord({ performers: [{ name: "Someone Else" }] }), MB, [TEST_ARTIST]).ok).toBe(false);
    expect(normalizeRecord(fixtureRecord({ localDate: "2027-13-45" }), MB, [TEST_ARTIST]).ok).toBe(false);
    const noOffset = fixtureRecord({ ticket: { status: "early_bird", sourceExposesAvailability: true, earlyBirdEndsAt: "2026-11-09T23:59" } });
    expect(normalizeRecord(noOffset, TM, [TEST_ARTIST]).ok).toBe(false);
    const withOffset = fixtureRecord({ ticket: { status: "early_bird", sourceExposesAvailability: true, earlyBirdEndsAt: "2026-11-09T23:59:00+05:30" } });
    expect(normalizeRecord(withOffset, TM, [TEST_ARTIST]).ok).toBe(true);
  });

  it("missing date or city → no match key (can't be cross-matched)", () => {
    const r = normalizeRecord(fixtureRecord({ localDate: undefined, localTime: undefined }), MB, [TEST_ARTIST]);
    expect(r.ok && r.record.matchKeys).toEqual([]);
    expect(r.ok && r.record.fields.startsAt).toBeNull();
  });

  it("rejects malformed records without throwing", () => {
    expect(normalizeRecord({ nonsense: true }, MB, [TEST_ARTIST]).ok).toBe(false);
    expect(normalizeRecord(null, MB, [TEST_ARTIST]).ok).toBe(false);
  });

  it("venue keys ignore generic words and case", () => {
    expect(venueKey("The TEST Hall")).toBe(venueKey("test"));
    expect(venueKey(undefined)).toBeNull();
  });
});

describe("mergeEvidence (field resolution)", () => {
  const norm = (rec = fixtureRecord(), src: typeof MB | typeof TM = MB) => {
    const r = normalizeRecord(rec, src, [TEST_ARTIST]);
    if (!r.ok) throw new Error(r.reason);
    return r.record;
  };
  const row = (rec: ReturnType<typeof norm>, at: string) => ({
    source_id: rec.sourceId,
    record: { fields: rec.fields, sourceClass: rec.sourceClass },
    last_success_at: new Date(at),
  });

  it("stronger source wins; weaker never overwrites; nulls never overwrite", () => {
    const community = norm(fixtureRecord({ venueName: "TEST Hall", localTime: undefined }));
    const ticketing = norm(fixtureRecord({ venueName: undefined, ticket: { status: "on_sale", sourceExposesAvailability: true, url: "https://tickets.example.test/1" } }), TM);
    const { fields, conflicts } = mergeEvidence([row(community, "2026-10-10T00:00:00Z"), row(ticketing, "2026-10-01T00:00:00Z")]);
    expect(fields.venueName).toBe("TEST Hall"); // filled from the weaker source because the stronger had null
    expect(fields.ticketStatus).toBe("on_sale"); // only the ticketing source exposes availability
    expect(fields.startsAt).toBe("2027-02-13T14:00:00.000Z"); // ticketing source had the time
    expect(conflicts).toEqual([]);
  });

  it("flags disagreements on date/venue/city/status as conflicts", () => {
    const a = norm(fixtureRecord({ localDate: "2027-02-13" }));
    const b = norm(fixtureRecord({ localDate: "2027-02-14", sourceEventId: "TEST-EVT-2" }), TM);
    const { fields, conflicts } = mergeEvidence([row(a, "2026-10-10T00:00:00Z"), row(b, "2026-10-10T00:00:00Z")]);
    expect(conflicts).toContain("localDate");
    expect(fields.localDate).toBe("2027-02-14"); // ticketing outranks community
  });
});

describe("change comparison (regression: strings containing T were parsed as dates)", () => {
  it("compares by field type", () => {
    expect(comparable("venueName", "The Tabla Lounge")).toBe("The Tabla Lounge");
    expect(comparable("startsAt", new Date("2027-02-13T14:00:00Z"))).toBe(comparable("startsAt", "2027-02-13T19:30:00+05:30"));
    expect(comparable("localDate", new Date("2027-02-13T00:00:00Z"))).toBe("2027-02-13");
    expect(comparable("ticketUrl", null)).toBeNull();
  });
});
