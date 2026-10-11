import { afterEach, describe, expect, it, vi } from "vitest";
import type { Extraction } from "@/integrations/gemini/announcement-extraction";
import { createScrapingBeeNewsAdapter, passesPrefilter, recordFrom, type NewsResult } from "@/integrations/events/scrapingbee-news";
import { ground } from "@/server/announcements";
import { FetchError } from "@/server/safe-fetch";

/** ScrapingBee news discovery with MOCKED search + MOCKED AI (no credits, no Gemini calls). */

const NOW = new Date("2026-10-11T06:00:00Z");
const artist = { artistId: "a1", name: "Prateek Kuhad", aliases: [] as string[] };
const saved = { ...process.env };
afterEach(() => {
  for (const k of ["SCRAPINGBEE_API_KEY", "GEMINI_API_KEY", "SCRAPINGBEE_MAX_ARTISTS_PER_RUN"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function extraction(o: Partial<Extraction> = {}): Extraction {
  const ev = <T>(value: T | null, evidence: string | null = null) => ({ value, evidence });
  return {
    is_event_announcement: true,
    announcement_type: "new_show",
    artists: [{ name: "Prateek Kuhad", evidence: "Prateek Kuhad" }],
    event_title: ev("Prateek Kuhad live", null),
    date: { value: "2026-12-12", raw_text: "12 December 2026", ambiguous: false },
    start_time: ev(null),
    venue: ev("Phoenix Arena", "Phoenix Arena"),
    city: ev("Bengaluru", "Bengaluru"),
    country: ev(null),
    ticket_url: ev(null),
    ticket_sale_opens: ev(null),
    early_bird: { status: "not_mentioned", ends_at: null, evidence: null },
    confidence: "high",
    uncertainties: [],
    ...o,
  } as Extraction;
}

const item: NewsResult = { title: "Prateek Kuhad announces Bengaluru show", snippet: "Prateek Kuhad will play Phoenix Arena, Bengaluru on 12 December 2026.", link: "https://news.example/pk" };

describe("pre-filter (before any AI call)", () => {
  it("needs the artist named and the current/next year mentioned", () => {
    expect(passesPrefilter(artist, "Prateek Kuhad will play Bengaluru in December 2026", NOW)).toBe(true);
    expect(passesPrefilter(artist, "Prateek Kuhad played Delhi in Winter of '21", NOW)).toBe(false); // stale
    expect(passesPrefilter(artist, "10 concerts to see in India in 2026", NOW)).toBe(false); // artist not named
  });
});

describe("recordFrom: only trustworthy, upcoming, Indian, exact-artist shows", () => {
  it("keeps a full upcoming date in a known Indian city, as an unverified-ticket community record", () => {
    const r = recordFrom(artist, item, extraction(), NOW);
    expect(r).toMatchObject({ localDate: "2026-12-12", cityName: "Bengaluru", countryCode: "IN", timeZone: "Asia/Kolkata", sourceUrl: "https://news.example/pk" });
    expect(r?.ticket).toEqual({ status: "unknown", sourceExposesAvailability: false });
  });
  it("drops past dates, missing dates, non-Indian cities, other artists, non-announcements", () => {
    expect(recordFrom(artist, item, extraction({ date: { value: "2026-03-01", raw_text: "", ambiguous: false } }), NOW)).toBeNull();
    expect(recordFrom(artist, item, extraction({ date: { value: null, raw_text: "this December", ambiguous: true } }), NOW)).toBeNull();
    expect(recordFrom(artist, item, extraction({ city: { value: "London", evidence: "London" } }), NOW)).toBeNull();
    expect(recordFrom(artist, item, extraction({ artists: [{ name: "Someone Else", evidence: "x" }] }), NOW)).toBeNull();
    expect(recordFrom(artist, item, extraction({ is_event_announcement: false }), NOW)).toBeNull();
  });
  it("stable id: the same article + show maps to the same record (no duplicates on re-runs)", () => {
    expect(recordFrom(artist, item, extraction(), NOW)?.sourceEventId).toBe(recordFrom(artist, item, extraction(), NOW)?.sourceEventId);
  });
});

describe("adapter run", () => {
  it("not configured without SCRAPINGBEE_API_KEY", () => {
    delete process.env.SCRAPINGBEE_API_KEY;
    expect(createScrapingBeeNewsAdapter(() => null).configStatus()).toMatchObject({ configured: false, reason: "SCRAPINGBEE_API_KEY is not set" });
  });

  it("searches once per artist (capped), AI only on pre-filtered snippets, grounding applied", async () => {
    Object.assign(process.env, { SCRAPINGBEE_API_KEY: "TEST", GEMINI_API_KEY: "TEST", SCRAPINGBEE_MAX_ARTISTS_PER_RUN: "2" });
    const search = vi.fn(async (): Promise<NewsResult[]> => [item, { title: "Old news", snippet: "Prateek Kuhad in 2019", link: "https://news.example/old" }]);
    const extract = vi.fn(async () => extraction());
    const adapter = createScrapingBeeNewsAdapter(() => ({ search, extract, ground, now: () => NOW }));
    const out = await adapter.fetchForArtists(
      [artist, { artistId: "a2", name: "The Local Train", aliases: [] }, { artistId: "a3", name: "Third Artist", aliases: [] }],
      { deadline: Date.now() + 60_000 },
    );
    expect(search).toHaveBeenCalledTimes(2); // cap
    expect(extract).toHaveBeenCalledTimes(1); // only the 2026 Prateek snippet passed the pre-filter
    expect(out.ok && out.records).toHaveLength(1);
    expect(out.ok && out.checkedArtistIds).toEqual(["a1", "a2"]);
  });

  it("grounding removes a venue the AI invented (not in the snippet)", async () => {
    Object.assign(process.env, { SCRAPINGBEE_API_KEY: "TEST", GEMINI_API_KEY: "TEST" });
    const adapter = createScrapingBeeNewsAdapter(() => ({
      search: async () => [item],
      extract: async () => extraction({ venue: { value: "Invented Stadium", evidence: "Invented Stadium" } }),
      ground,
      now: () => NOW,
    }));
    const out = await adapter.fetchForArtists([artist], { deadline: Date.now() + 60_000 });
    expect(out.ok && out.records[0]?.venueName).toBeUndefined();
  });

  it("a failed first request (bad key / no credits) is reported as a source failure, not 'no events'", async () => {
    Object.assign(process.env, { SCRAPINGBEE_API_KEY: "TEST", GEMINI_API_KEY: "TEST" });
    const adapter = createScrapingBeeNewsAdapter(() => ({
      search: async () => {
        throw new FetchError("HTTP 401", "http", 401);
      },
      extract: async () => extraction(),
      ground,
      now: () => NOW,
    }));
    const out = await adapter.fetchForArtists([artist], { deadline: Date.now() + 60_000 });
    expect(out.ok).toBe(false);
  });
});
