import { describe, expect, it } from "vitest";
import { compareByPriority, deriveEventSignals, isInLocationScope } from "@/domain/event-signals";
import { verificationFor } from "@/domain/freshness";
import type { DiscoveryReport, LiveEvent, LocationPreference } from "@/domain/types";
import { deriveDashboard } from "@/features/discovery/dashboard-view";
import { initialOnboardingState, migrateOnboardingState, onboardingReducer } from "@/features/onboarding/state";

const NOW = new Date("2026-11-05T06:30:00Z"); // 12:00 IST
const HOUR = 3_600_000;
const LOC: LocationPreference = { primaryCityId: "bengaluru", additionalCityIds: ["mumbai"], includeNationwide: true };

function event(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    id: "TEST-E1",
    artistIds: ["mbid:TEST"],
    artistNames: ["TEST Fixture Band"],
    title: "TEST show",
    kind: "concert",
    venueName: "TEST Hall",
    cityName: "Bengaluru",
    cityId: "bengaluru",
    countryCode: "IN",
    when: { date: "2027-02-13", startsAt: "2027-02-13T14:00:00.000Z", timeZone: "Asia/Kolkata" },
    ticket: { kind: "unknown", verification: { state: "unavailable" } },
    source: { id: "test", name: "TEST source", origin: "event_source" },
    verification: { state: "confirmed" },
    origin: "event_source",
    ...overrides,
  };
}

describe("freshness rules", () => {
  const ago = (h: number) => new Date(NOW.getTime() - h * HOUR);
  it("ticketing availability goes stale after 6h", () => {
    expect(verificationFor("ticketing", "ticket_availability", ago(5), NOW, { sourceProvidesFact: true })).toBe("confirmed");
    expect(verificationFor("ticketing", "ticket_availability", ago(7), NOW, { sourceProvidesFact: true })).toBe("stale");
  });
  it("community sources never confirm availability; user submissions never confirm anything", () => {
    expect(verificationFor("community", "ticket_availability", ago(1), NOW, { sourceProvidesFact: true })).toBe("unconfirmed");
    expect(verificationFor("community", "event_details", ago(24 * 13), NOW, { sourceProvidesFact: true })).toBe("confirmed");
    expect(verificationFor("community", "event_details", ago(24 * 15), NOW, { sourceProvidesFact: true })).toBe("stale");
    expect(verificationFor("user_submitted", "event_details", ago(0), NOW, { sourceProvidesFact: true })).toBe("unconfirmed");
  });
  it("missing data and failures are explicit", () => {
    expect(verificationFor("ticketing", "ticket_availability", null, NOW, { sourceProvidesFact: false })).toBe("unavailable");
    expect(verificationFor("ticketing", "ticket_availability", null, NOW, { sourceProvidesFact: true })).toBe("pending");
    expect(verificationFor("ticketing", "ticket_availability", null, NOW, { sourceProvidesFact: true, lastAttemptFailed: true })).toBe("unavailable");
  });
});

describe("event signals & deadlines", () => {
  const earlyBird = (endsAt: string, state: "confirmed" | "unconfirmed" = "confirmed") =>
    event({ ticket: { kind: "early_bird", verification: { state }, earlyBirdEndsAt: endsAt } });

  it("deadline within 7 days is 'approaching' only when the ticket status is confirmed", () => {
    expect(deriveEventSignals(earlyBird("2026-11-09T23:59:00+05:30"), NOW, LOC).deadlineApproaching).toBe(true);
    expect(deriveEventSignals(earlyBird("2026-11-09T23:59:00+05:30", "unconfirmed"), NOW, LOC).deadlineApproaching).toBe(false);
    expect(deriveEventSignals(earlyBird("2026-11-20T23:59:00+05:30"), NOW, LOC).deadlineApproaching).toBe(false);
  });
  it("a passed deadline closes the early-bird window", () => {
    const s = deriveEventSignals(earlyBird("2026-11-05T11:00:00+05:30"), NOW, LOC);
    expect(s.deadlinePassed).toBe(true);
    expect(s.earlyBirdOpen).toBe(false);
  });
  it("timezone boundary: 11:59 IST deadline vs 12:00 IST now", () => {
    expect(deriveEventSignals(earlyBird("2026-11-05T11:59:00+05:30"), NOW, LOC).deadlinePassed).toBe(true);
    expect(deriveEventSignals(earlyBird("2026-11-05T12:01:00+05:30"), NOW, LOC).deadlinePassed).toBe(false);
  });
  it("'new' requires a real announcement time within 7 days", () => {
    expect(deriveEventSignals(event({ announcedAt: "2026-11-01T10:00:00+05:30" }), NOW, LOC).isNew).toBe(true);
    expect(deriveEventSignals(event({ announcedAt: undefined }), NOW, LOC).isNew).toBe(false);
  });
  it("date-only events are past only after the day ends; unknown dates are neither past nor upcoming", () => {
    const today = event({ when: { date: "2026-11-05", timeZone: "Asia/Kolkata" } });
    expect(deriveEventSignals(today, NOW, LOC).isPast).toBe(false);
    const undated = deriveEventSignals(event({ when: { timeZone: "Asia/Kolkata" } }), NOW, LOC);
    expect(undated.isPast).toBe(false);
    expect(undated.isUpcoming).toBe(false);
  });
  it("locality and scope: priority, not exclusion", () => {
    expect(deriveEventSignals(event(), NOW, LOC).locality).toBe("primary");
    expect(deriveEventSignals(event({ cityId: "mumbai" }), NOW, LOC).locality).toBe("additional");
    expect(deriveEventSignals(event({ cityId: "chennai" }), NOW, LOC).locality).toBe("elsewhere");
    expect(isInLocationScope(event({ cityId: "chennai" }), LOC)).toBe(true);
    expect(isInLocationScope(event({ cityId: "chennai" }), { ...LOC, includeNationwide: false })).toBe(false);
  });
  it("sorts primary city first, then by date", () => {
    const list = [event({ id: "c", cityId: "chennai" }), event({ id: "b", cityId: "bengaluru" }), event({ id: "m", cityId: "mumbai" })];
    expect(list.sort(compareByPriority(LOC)).map((e) => e.id)).toEqual(["b", "m", "c"]);
  });
});

describe("dashboard situations stay distinct", () => {
  const state = { selections: [{ artist: { id: "mbid:x", name: "X", origin: "musicbrainz" as const }, addedVia: "manual" as const, selectedAt: "2026-10-01T00:00:00Z" }], location: LOC };
  const report = (r: Partial<DiscoveryReport>): DiscoveryReport => ({ status: "ok", generatedAt: NOW.toISOString(), sources: [], events: [], ...r });

  it("no artists / storage off / not connected / never checked / failed / no matches / results", () => {
    expect(deriveDashboard({ ...state, selections: [] }, { phase: "idle" }, NOW).kind).toBe("no_artists");
    expect(deriveDashboard(state, { phase: "storage_off" }, NOW).kind).toBe("storage_off");
    expect(deriveDashboard(state, { phase: "ready", report: report({ status: "not_connected" }) }, NOW).kind).toBe("not_connected");
    expect(deriveDashboard(state, { phase: "ready", report: report({ status: "never_checked" }) }, NOW).kind).toBe("never_checked");
    expect(deriveDashboard(state, { phase: "ready", report: report({ status: "error" }) }, NOW).kind).toBe("sources_failed");
    expect(deriveDashboard(state, { phase: "error", message: "x" }, NOW).kind).toBe("request_failed");
    expect(deriveDashboard(state, { phase: "ready", report: report({ lastSuccessfulCheckAt: NOW.toISOString() }) }, NOW).kind).toBe("no_matches");
    const res = deriveDashboard(state, { phase: "ready", report: report({ events: [event()], lastSuccessfulCheckAt: NOW.toISOString() }) }, NOW);
    expect(res.kind).toBe("results");
  });
  it("a failed latest check with stored events shows results marked stale, not 'no events'", () => {
    const res = deriveDashboard(state, { phase: "ready", report: report({ status: "error", events: [event()], lastSuccessfulCheckAt: NOW.toISOString() }) }, NOW);
    expect(res.kind === "results" && res.stale).toBe(true);
  });
});

describe("onboarding reducer & migration", () => {
  const artist = { id: "mbid:TEST", name: "TEST", origin: "musicbrainz" as const, externalIds: { musicbrainz: "TEST" } };
  it("toggle adds then removes; repeated saves are no-ops", () => {
    let s = onboardingReducer(initialOnboardingState, { type: "toggle_artist", artist, addedVia: "manual", at: NOW.toISOString() });
    expect(s.selections).toHaveLength(1);
    s = onboardingReducer(s, { type: "toggle_artist", artist, addedVia: "manual", at: NOW.toISOString() });
    expect(s.selections).toHaveLength(0);
    const e = event();
    s = onboardingReducer(s, { type: "save_event", event: e, at: NOW.toISOString() });
    const again = onboardingReducer(s, { type: "save_event", event: e, at: NOW.toISOString() });
    expect(again).toBe(s);
    expect(again.savedEvents).toHaveLength(1);
  });
  it("primary city can't also be an additional city", () => {
    let s = onboardingReducer(initialOnboardingState, { type: "toggle_additional_city", cityId: "mumbai" });
    s = onboardingReducer(s, { type: "set_primary_city", cityId: "mumbai" });
    expect(s.location.additionalCityIds).not.toContain("mumbai");
  });
  it("migrates v1 drafts and rejects garbage", () => {
    const v1 = { ...initialOnboardingState, version: 1, savedEvents: undefined, notifications: { triggers: { new_announcement: false } } };
    const m = migrateOnboardingState(v1);
    expect(m?.version).toBe(2);
    expect(m?.notifications.triggers.new_announcement).toBe(false);
    expect(m?.notifications.triggers.deadline_approaching).toBe(true);
    expect(migrateOnboardingState({ version: 9 })).toBeNull();
    expect(migrateOnboardingState("nope")).toBeNull();
  });
});
