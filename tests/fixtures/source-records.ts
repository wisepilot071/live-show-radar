/**
 * TEST FIXTURES — fictional source records for automated tests only.
 * Every id and name starts with "TEST" so it can never be mistaken for live
 * concert data, and none of this is imported by application code.
 */
import type { SourceArtistRef, SourceEventRecord } from "@/integrations/events/contract";

export const TEST_ARTIST: SourceArtistRef = {
  artistId: "00000000-0000-4000-8000-0000000000a1",
  name: "TEST Fixture Band",
  aliases: ["TFB"],
  musicbrainzId: "00000000-0000-4000-8000-00000000mb01".replace("mb01", "0001"),
};

export const TEST_ARTIST_2: SourceArtistRef = {
  artistId: "00000000-0000-4000-8000-0000000000a2",
  name: "TEST Second Act",
  aliases: [],
};

export function fixtureRecord(overrides: Partial<SourceEventRecord> = {}): SourceEventRecord {
  return {
    sourceEventId: "TEST-EVT-1",
    sourceUrl: "https://example.test/events/1",
    title: "TEST Fixture Band — Bengaluru",
    kind: "concert",
    performers: [{ name: "TEST Fixture Band", musicbrainzId: TEST_ARTIST.musicbrainzId }],
    localDate: "2027-02-13",
    localTime: "19:30",
    timeZone: "Asia/Kolkata",
    venueName: "TEST Hall",
    cityName: "Bangalore",
    countryCode: "IN",
    eventStatus: "scheduled",
    ticket: { status: "unknown", sourceExposesAvailability: false },
    ...overrides,
  };
}
