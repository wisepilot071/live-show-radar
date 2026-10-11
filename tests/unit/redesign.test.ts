import { describe, expect, it, vi } from "vitest";
import type { ArtistSelection, LiveEvent, LocationPreference } from "@/domain/types";
import { applyFilters, buildSections, DEFAULT_FILTERS, genreOptions } from "@/features/discovery/sections";
import { finishOnboarding } from "@/features/onboarding/finish";
import type { SyncResult } from "@/features/onboarding/server-sync";
import type { OnboardingAction } from "@/features/onboarding/state";
import { nextStep, previousStep, stepSequence } from "@/features/onboarding/steps";

/* ------------------------------------------------------------------ */
/* Onboarding: no review step, save before navigating                  */
/* ------------------------------------------------------------------ */

describe("onboarding steps: artists → cities → alerts, no review step", () => {
  it("no path contains a review step; every path ends with artists, cities, alerts", () => {
    for (const m of [null, "manual", "spotify", "mix"] as const) {
      const seq = stepSequence() as string[]; void m;
      expect(seq.slice(-3)).toEqual(["artists", "location", "alerts"]);
      expect(seq).not.toContain("review");
      expect(seq).not.toContain("status");
    }
    expect(stepSequence()).toEqual(["artists", "location", "alerts"]);
  });
  it("artists goes straight to cities; alerts is the last step (then the radar)", () => {
    expect(nextStep(null, "artists")?.path).toBe("/onboarding/location");
    expect(nextStep(null, "location")?.path).toBe("/onboarding/alerts");
    expect(nextStep(null, "alerts")).toBeNull();
    expect(previousStep(null, "artists")).toBeNull(); // entry step: back goes home
  });
});

function harness(opts: { flushOk?: boolean[]; runResults?: SyncResult[] } = {}) {
  const calls: string[] = [];
  const flushQueue = [...(opts.flushOk ?? [true])];
  const runQueue = [...(opts.runResults ?? [])];
  const deps = {
    run: vi.fn(async (a: OnboardingAction): Promise<SyncResult> => {
      calls.push(`run:${a.type}`);
      return runQueue.shift() ?? { ok: true };
    }),
    flush: vi.fn(async () => {
      calls.push("flush");
      return flushQueue.shift() ?? true;
    }),
    navigate: vi.fn((p: string) => {
      calls.push(`navigate:${p}`);
    }),
  };
  return { deps, calls };
}

describe("finishOnboarding: persist first, then go to the dashboard", () => {
  it("success: waits for artist writes, records method + completion, then navigates to /radar", async () => {
    const { deps, calls } = harness();
    const r = await finishOnboarding({ method: null, artistCount: 2, ...deps });
    expect(r).toEqual({ ok: true });
    expect(calls).toEqual(["flush", "run:choose_method", "run:complete", "navigate:/radar"]);
    expect(deps.run.mock.calls[0]?.[0]).toEqual({ type: "choose_method", method: "manual" });
  });

  it("an existing method is kept", async () => {
    const { deps, calls } = harness();
    await finishOnboarding({ method: "mix", artistCount: 1, ...deps });
    expect(calls).toEqual(["flush", "run:complete", "navigate:/radar"]);
  });

  it("a failed artist write: no false-success redirect, clear message", async () => {
    const { deps } = harness({ flushOk: [false] });
    const r = await finishOnboarding({ method: "manual", artistCount: 2, ...deps });
    expect(r.ok).toBe(false);
    expect(deps.navigate).not.toHaveBeenCalled();
    expect(deps.run).not.toHaveBeenCalled(); // completion isn't recorded over a failed save
  });

  it("a failed completion save: no redirect", async () => {
    const { deps } = harness({ runResults: [{ ok: false, error: { code: "database_unavailable", message: "DB down." } }] });
    const r = await finishOnboarding({ method: "manual", artistCount: 2, ...deps });
    expect(r).toEqual({ ok: false, message: "DB down." });
    expect(deps.navigate).not.toHaveBeenCalled();
  });

  it("retry after a failure succeeds and navigates exactly once", async () => {
    const { deps } = harness({ runResults: [{ ok: false, error: { code: "x", message: "Try again." } }, { ok: true }] });
    expect((await finishOnboarding({ method: "manual", artistCount: 1, ...deps })).ok).toBe(false);
    expect((await finishOnboarding({ method: "manual", artistCount: 1, ...deps })).ok).toBe(true);
    expect(deps.navigate).toHaveBeenCalledTimes(1);
  });

  it("no artists: nothing is written and nothing navigates", async () => {
    const { deps } = harness();
    const r = await finishOnboarding({ method: null, artistCount: 0, ...deps });
    expect(r.ok).toBe(false);
    expect(deps.flush).not.toHaveBeenCalled();
    expect(deps.navigate).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/* Discovery sections & filters (real-data predicates only)            */
/* ------------------------------------------------------------------ */

const NOW = new Date("2026-11-05T06:30:00Z");
const LOC: LocationPreference = { primaryCityId: "bengaluru", additionalCityIds: [], includeNationwide: true };

function ev(id: string, o: Partial<LiveEvent> = {}): LiveEvent {
  return {
    id,
    artistIds: ["mbid:test-a"],
    artistNames: ["TEST Band"],
    title: "TEST show",
    kind: "concert",
    venueName: "TEST Hall",
    cityName: "Bengaluru",
    cityId: "bengaluru",
    countryCode: "IN",
    when: { date: "2026-11-20", startsAt: "2026-11-20T14:00:00.000Z", timeZone: "Asia/Kolkata" },
    ticket: { kind: "unknown", verification: { state: "unavailable" } },
    source: { id: "test", name: "TEST source", origin: "event_source" },
    verification: { state: "confirmed" },
    origin: "event_source",
    ...o,
  };
}
const confirmed = { state: "confirmed" as const, lastVerifiedAt: "2026-11-05T05:00:00Z" };

describe("buildSections: every section is a data-backed predicate", () => {
  const events = [
    ev("plain"),
    ev("onsale-link", { ticket: { kind: "on_sale", verification: confirmed, bookingUrl: "https://tickets.example/x" } }),
    ev("onsale-nolink", { ticket: { kind: "on_sale", verification: confirmed } }),
    ev("onsale-unverified", { ticket: { kind: "on_sale", verification: { state: "unconfirmed" }, bookingUrl: "https://t.example" } }),
    ev("earlybird", { ticket: { kind: "early_bird", verification: confirmed, earlyBirdEndsAt: "2026-11-08T18:29:00Z" } }),
    ev("earlybird-unverified", { ticket: { kind: "early_bird", verification: { state: "unconfirmed" } } }),
    ev("soon", { ticket: { kind: "announced_not_on_sale", verification: confirmed, saleOpensAt: "2026-11-10T06:30:00Z" } }),
    ev("new", { announcedAt: "2026-11-03T10:00:00Z" }),
    ev("mumbai", { cityId: "mumbai", cityName: "Mumbai" }),
    ev("past", { when: { date: "2026-10-01", timeZone: "Asia/Kolkata" } }),
    ev("cancelled", { ticket: { kind: "cancelled", verification: confirmed } }),
  ];
  const s = buildSections(events, LOC, NOW);
  const ids = (list: LiveEvent[]) => list.map((e) => e.id).sort();

  it("tickets available: verified on-sale with a real link only", () => {
    expect(ids(s.ticketsAvailable)).toEqual(["onsale-link"]);
  });
  it("early bird: only verified windows (never inferred)", () => {
    expect(ids(s.earlyBird)).toEqual(["earlybird"]);
  });
  it("coming soon: verified not-on-sale / future sale date", () => {
    expect(ids(s.comingSoon)).toEqual(["soon"]);
  });
  it("just announced needs a real announcement time", () => {
    expect(ids(s.justAnnounced)).toEqual(["new"]);
  });
  it("attention: approaching verified deadline and cancellations", () => {
    expect(ids(s.attention)).toEqual(["cancelled", "earlybird"]);
  });
  it("beyond home: other cities only; past shows never appear anywhere", () => {
    expect(ids(s.beyondHome)).toEqual(["mumbai"]);
    const all = Object.values(s).flat().map((e) => e.id);
    expect(all).not.toContain("past");
  });
  it("from your artists: every upcoming, non-cancelled show, home city first", () => {
    expect(s.fromYourArtists.at(-1)?.id).toBe("mumbai");
    expect(ids(s.fromYourArtists)).not.toContain("cancelled");
  });
  it("no events → every section empty (nothing manufactured)", () => {
    expect(Object.values(buildSections([], LOC, NOW)).every((l) => l.length === 0)).toBe(true);
  });
});

describe("applyFilters: controls actually change results", () => {
  const sel = (key: string, name: string, genres: string[]): ArtistSelection => ({
    artist: { id: key, name, origin: "musicbrainz", externalIds: { musicbrainz: key.replace("mbid:", "") }, genres },
    addedVia: "manual",
    selectedAt: "2026-11-01T00:00:00Z",
  });
  const selections = [sel("mbid:a", "Folk Act", ["Indie Folk"]), sel("mbid:b", "Rock Act", ["Rock"])];
  const events = [
    ev("a-blr", { artistIds: ["mbid:a"] }),
    ev("b-mum", { artistIds: ["mbid:b"], cityId: "mumbai", cityName: "Mumbai", when: { date: "2027-03-01", timeZone: "Asia/Kolkata" } }),
    ev("a-undated", { artistIds: ["mbid:a"], when: { timeZone: "Asia/Kolkata" } }),
  ];
  const run = (f: Partial<typeof DEFAULT_FILTERS>) =>
    applyFilters(events, { ...DEFAULT_FILTERS, ...f }, { selections, now: NOW }).map((e) => e.id);

  it("defaults keep everything", () => expect(run({})).toEqual(["a-blr", "b-mum", "a-undated"]));
  it("city", () => expect(run({ city: "mumbai" })).toEqual(["b-mum"]));
  it("artist", () => expect(run({ artist: "mbid:b" })).toEqual(["b-mum"]));
  it("genre comes from the followed artists' own tags", () => {
    expect(genreOptions(selections)).toEqual(["Indie Folk", "Rock"]);
    expect(run({ genre: "indie folk" })).toEqual(["a-blr", "a-undated"]);
  });
  it("date window excludes unknown dates and far-future shows", () => {
    expect(run({ when: "30d" })).toEqual(["a-blr"]);
  });
});
