import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@/domain/types";
import { activeReminderWindow, classifyChange, decide, type DecisionInput } from "@/server/notifications/decide";

const NOW = new Date("2026-11-05T06:30:00Z"); // 12:00 IST

function event(o: Partial<LiveEvent> = {}): LiveEvent {
  return {
    id: "TEST-EVT",
    artistIds: ["test:a"],
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
    ...o,
  };
}

function input(o: Partial<DecisionInput> = {}, user: Partial<DecisionInput["user"]> = {}): DecisionInput {
  return {
    kind: "new_show",
    event: event(),
    sourceClass: "listing",
    sourceName: "TEST source",
    now: NOW,
    ...o,
    user: {
      triggers: {},
      location: { primaryCityId: "bengaluru", additionalCityIds: [], includeNationwide: true },
      followsArtist: true,
      savedEvent: false,
      mutedEvent: false,
      ...user,
    },
  };
}

describe("classifyChange: only meaningful changes become alerts", () => {
  it("maps fields to kinds", () => {
    expect(classifyChange({ change_type: "created", field: null, old_value: null, new_value: null })).toBe("new_show");
    expect(classifyChange({ change_type: "updated", field: "localDate", old_value: "2027-02-13", new_value: "2027-02-14" })).toBe("date_changed");
    expect(classifyChange({ change_type: "updated", field: "venueName", old_value: "A", new_value: "B" })).toBe("venue_changed");
    expect(classifyChange({ change_type: "updated", field: "eventStatus", old_value: "scheduled", new_value: "cancelled" })).toBe("cancelled");
    expect(classifyChange({ change_type: "updated", field: "ticketStatus", old_value: "unknown", new_value: "early_bird" })).toBe("early_bird_announced");
    expect(classifyChange({ change_type: "updated", field: "saleOpensAt", old_value: null, new_value: "2026-11-10T12:00:00Z" })).toBe("sale_date_announced");
  });
  it("ignores noise: URL edits, info disappearing, first venue, conflicts", () => {
    expect(classifyChange({ change_type: "updated", field: "ticketUrl", old_value: "a", new_value: "b" })).toBeNull();
    expect(classifyChange({ change_type: "updated", field: "ticketStatus", old_value: "on_sale", new_value: "unknown" })).toBeNull();
    expect(classifyChange({ change_type: "updated", field: "venueName", old_value: null, new_value: "TEST Hall" })).toBeNull();
    expect(classifyChange({ change_type: "conflict", field: "localDate", old_value: null, new_value: null })).toBeNull();
    expect(classifyChange({ change_type: "updated", field: "startsAt", old_value: "x", new_value: "y" })).toBeNull();
  });
});

describe("decide: preferences, scope and verification", () => {
  it("notifies a follower about a verified new show, with a reason", () => {
    const d = decide(input());
    expect(d.notify).toBe(true);
    if (!d.notify) return;
    expect(d.category).toBe("new_show");
    expect(d.priority).toBe("normal"); // a new show is not automatically urgent
    expect(d.reason).toContain("artist you follow");
    expect(d.dedupeKey).toBe("new:TEST-EVT");
  });
  it("respects follows, mutes and disabled triggers", () => {
    expect(decide(input({}, { followsArtist: false }))).toEqual({ notify: false, skip: "not_following" });
    expect(decide(input({}, { mutedEvent: true }))).toEqual({ notify: false, skip: "muted" });
    expect(decide(input({}, { triggers: { new_announcement: false } }))).toEqual({ notify: false, skip: "trigger_disabled" });
  });
  it("city preferences: alerts only for the person's chosen cities (home + extra); saved shows always", () => {
    const soon = { date: "2026-12-10", startsAt: "2026-12-10T14:00:00.000Z", timeZone: "Asia/Kolkata" };
    const chennai = event({ cityId: "chennai", cityName: "Chennai", when: soon });
    expect(decide(input({ event: chennai }))).toEqual({ notify: false, skip: "not_in_chosen_cities" });
    expect(decide(input({ event: chennai }, { location: { primaryCityId: "chennai", additionalCityIds: [], includeNationwide: true } })).notify).toBe(true);
    const mumbai = event({ cityId: "mumbai", cityName: "Mumbai" });
    expect(decide(input({ event: mumbai }, { location: { primaryCityId: "bengaluru", additionalCityIds: ["mumbai"], includeNationwide: true } })).notify).toBe(true);
    // A change to a show you saved still reaches you, wherever it is.
    expect(decide(input({ kind: "cancelled", event: chennai }, { savedEvent: true })).notify).toBe(true);
  });
  it("never alerts from unverified, stale, past, or user-submitted information", () => {
    expect(decide(input({ sourceClass: "user_submitted" }))).toEqual({ notify: false, skip: "unverified_source" });
    expect(decide(input({ event: event({ verification: { state: "stale" } }) }))).toEqual({ notify: false, skip: "event_not_verified" });
    expect(decide(input({ event: event({ when: { date: "2026-10-01", timeZone: "Asia/Kolkata" } }) }))).toEqual({ notify: false, skip: "past_event" });
    expect(decide(input({ kind: "ticket_status_changed" }))).toEqual({ notify: false, skip: "ticket_not_verified" });
  });
  it("priority: changes to a saved show are high; ordinary changes are normal", () => {
    const changed = input({ kind: "date_changed", newValue: "2027-02-14", oldValue: "2027-02-13" });
    expect(decide(changed)).toMatchObject({ notify: true, priority: "normal", category: "event_changed" });
    expect(decide({ ...changed, user: { ...changed.user, savedEvent: true } })).toMatchObject({ priority: "high" });
    expect(decide(input({ kind: "cancelled" }, { savedEvent: true }))).toMatchObject({ category: "cancelled", priority: "high", dedupeKey: "cancel:TEST-EVT" });
  });
  it("change dedupe keys depend on the new value (same value twice → same key)", () => {
    const a = decide(input({ kind: "date_changed", newValue: "2027-02-14" }));
    const b = decide(input({ kind: "date_changed", newValue: "2027-02-14" }));
    const c = decide(input({ kind: "date_changed", newValue: "2027-02-15" }));
    expect(a.notify && b.notify && a.dedupeKey === b.dedupeKey).toBe(true);
    expect(a.notify && c.notify && a.dedupeKey !== c.dedupeKey).toBe(true);
  });
});

describe("deadline reminders", () => {
  const eb = (endsAt: string | undefined, state: "confirmed" | "unconfirmed" = "confirmed") =>
    event({ ticket: { kind: "early_bird", verification: { state }, earlyBirdEndsAt: endsAt } });

  it("only with a verified deadline inside the window", () => {
    const ok = decide(input({ kind: "deadline_reminder", sourceClass: "ticketing", event: eb("2026-11-06T09:00:00+05:30"), reminderWindowHours: 24 }));
    expect(ok).toMatchObject({ notify: true, category: "deadline_reminder", priority: "high" });
    expect(decide(input({ kind: "deadline_reminder", sourceClass: "ticketing", event: eb(undefined), reminderWindowHours: 24 }))).toMatchObject({ notify: false });
    expect(decide(input({ kind: "deadline_reminder", sourceClass: "ticketing", event: eb("2026-11-06T09:00:00+05:30", "unconfirmed"), reminderWindowHours: 24 }))).toEqual({
      notify: false,
      skip: "ticket_not_verified",
    });
    expect(decide(input({ kind: "deadline_reminder", sourceClass: "ticketing", event: eb("2026-11-10T09:00:00+05:30"), reminderWindowHours: 24 }))).toEqual({
      notify: false,
      skip: "outside_reminder_window",
    });
  });
  it("picks the single smallest applicable window; nothing after the deadline", () => {
    expect(activeReminderWindow("2026-11-07T12:00:00+05:30", NOW, [72, 24])).toBe(72); // 48h left
    expect(activeReminderWindow("2026-11-05T20:00:00+05:30", NOW, [72, 24])).toBe(24); // 8h left → only the 24h reminder
    expect(activeReminderWindow("2026-11-05T11:59:00+05:30", NOW, [72, 24])).toBeNull(); // passed (IST boundary)
    expect(activeReminderWindow("2026-11-20T12:00:00+05:30", NOW, [72, 24])).toBeNull();
  });
  it("reminder dedupe key includes the deadline and window", () => {
    const d = decide(input({ kind: "deadline_reminder", sourceClass: "ticketing", event: eb("2026-11-06T09:00:00+05:30"), reminderWindowHours: 24 }));
    expect(d.notify && d.dedupeKey).toBe("deadline:TEST-EVT:2026-11-06T09:00:00+05:30:24h");
  });
});
