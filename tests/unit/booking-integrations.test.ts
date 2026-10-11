import { afterEach, describe, expect, it, vi } from "vitest";
import type { LiveEvent } from "@/domain/types";
import {
  authorizationUrl,
  buildCalendarEvent,
  calendarEventIdFor,
  CALENDAR_SCOPE,
  refreshAccessToken,
  upsertCalendarEvent,
} from "@/integrations/google/calendar";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { renderNotification } from "@/server/notifications/message";
import { sendTelegram, telegramStatus } from "@/server/notifications/telegram";

/** Provider behaviour with MOCKED HTTP only — nothing here touches a real service. */

const saved = { ...process.env };
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET", "SESSION_SECRET", "TOKEN_ENCRYPTION_KEY"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function ev(o: Partial<LiveEvent> = {}): LiveEvent {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    artistIds: ["mbid:test"],
    artistNames: ["TEST Band"],
    title: "TEST Tour",
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

describe("Google Calendar event building (no invented times)", () => {
  it("deterministic base32hex id per booking (retry-safe)", () => {
    const id = calendarEventIdFor("0b1e2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d");
    expect(id).toBe("lsr0b1e2c3d4e5f6a7b8c9d0e1f2a3b4c5d");
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(calendarEventIdFor("0b1e2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d")).toBe(id);
  });
  it("known start time: all-day on the LOCAL date, real start time in title; end time not invented", () => {
    // 2027-02-13T14:00Z = 19:30 IST, same day
    const r = buildCalendarEvent(ev(), "0b1e2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d", "https://radar.example");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.body.start).toEqual({ date: "2027-02-13" });
    expect(r.body.end).toEqual({ date: "2027-02-14" }); // exclusive end of an all-day event
    expect(r.body.summary).toMatch(/TEST Band \(7:30\s?pm IST\)/i);
    expect(r.body.description).toContain("end time not announced");
    expect(r.body.description).toContain("not verified with the ticket seller");
    expect(r.body.location).toBe("TEST Hall, Bengaluru");
  });
  it("timezone: an event at 00:30 IST lands on the local (IST) date, not the UTC date", () => {
    const r = buildCalendarEvent(ev({ when: { startsAt: "2027-02-12T19:00:00.000Z", timeZone: "Asia/Kolkata" } }), "0b1e2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d");
    expect(r.ok && r.body.start.date).toBe("2027-02-13");
  });
  it("date only: all-day with 'Start time not announced'", () => {
    const r = buildCalendarEvent(ev({ when: { date: "2027-03-01", timeZone: "Asia/Kolkata" } }), "0b1e2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d");
    expect(r.ok && r.body.description).toContain("Start time not announced.");
    expect(r.ok && r.body.summary).toBe("TEST Band");
  });
  it("no date at all: cannot be added (explained, not guessed)", () => {
    const r = buildCalendarEvent(ev({ when: { timeZone: "Asia/Kolkata" } }), "0b1e2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d");
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("hasn't been announced") });
  });
  it("authorisation URL asks only for calendar.events + identity (openid email), offline access, with state", () => {
    const u = new URL(authorizationUrl({ clientId: "TEST-id", clientSecret: "x", redirectUri: "https://radar.example/cb" }, "STATE123"));
    // Exactly these three: no broader calendar or profile access.
    expect(u.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", CALENDAR_SCOPE].sort());
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("state")).toBe("STATE123");
  });
});

describe("Google Calendar API handling (mocked HTTP)", () => {
  const body = { id: "lsrabc", summary: "s", description: "d", start: { date: "2027-02-13" }, end: { date: "2027-02-14" } };
  it("200 → created with link", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ id: "lsrabc", htmlLink: "https://calendar.google.com/x" }));
    expect(await upsertCalendarEvent("t", body)).toEqual({ ok: true, value: { id: "lsrabc", htmlLink: "https://calendar.google.com/x" } });
  });
  it("409 on retry → existing event is fetched, never duplicated", async () => {
    const f = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 409 }))
      .mockResolvedValueOnce(Response.json({ id: "lsrabc", status: "confirmed", htmlLink: "https://calendar.google.com/y" }));
    const r = await upsertCalendarEvent("t", body);
    expect(r).toEqual({ ok: true, value: { id: "lsrabc", htmlLink: "https://calendar.google.com/y" } });
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("401 → auth (reconnect needed); 500/network → retryable", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 401 }));
    expect(await upsertCalendarEvent("t", body)).toMatchObject({ ok: false, kind: "auth" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("{}", { status: 503 }));
    expect(await upsertCalendarEvent("t", body)).toMatchObject({ ok: false, kind: "retryable" });
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("offline"));
    expect(await upsertCalendarEvent("t", body)).toMatchObject({ ok: false, kind: "retryable" });
  });
  it("refresh rejected with invalid_grant (revoked/expired) → auth", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "invalid_grant" }, { status: 400 }));
    expect(await refreshAccessToken({ clientId: "a", clientSecret: "b" }, "r")).toMatchObject({ ok: false, kind: "auth" });
  });
});

describe("token encryption at rest", () => {
  it("round-trips, uses a fresh IV, and rejects tampering", () => {
    process.env.SESSION_SECRET = "TEST-session-secret-for-unit-tests-only";
    delete process.env.TOKEN_ENCRYPTION_KEY;
    const a = encryptSecret("ya29.TEST-access-token");
    const b = encryptSecret("ya29.TEST-access-token");
    expect(a).not.toBe(b);
    expect(a).not.toContain("ya29");
    expect(decryptSecret(a)).toBe("ya29.TEST-access-token");
    const parts = a.split(".");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

describe("Telegram channel (mocked HTTP)", () => {
  it("missing configuration is reported, nothing is sent", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const f = vi.spyOn(globalThis, "fetch");
    expect(telegramStatus()).toMatchObject({ configured: false, reason: "TELEGRAM_BOT_TOKEN is not set" });
    expect(await sendTelegram({ chatId: 1, text: "x" })).toMatchObject({ ok: false, retryable: false });
    expect(f).not.toHaveBeenCalled();
  });
  it("sent only when Telegram accepts; 429 retryable; 403 (bot blocked) permanent; token never in errors", async () => {
    Object.assign(process.env, { TELEGRAM_BOT_TOKEN: "TEST:token-value", TELEGRAM_BOT_USERNAME: "test_bot", TELEGRAM_WEBHOOK_SECRET: "TEST-secret" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ ok: true, result: { message_id: 42 } }));
    expect(await sendTelegram({ chatId: 1, text: "x" })).toEqual({ ok: true, providerMessageId: "42" });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ ok: false, description: "Too Many Requests" }, { status: 429 }));
    const limited = await sendTelegram({ chatId: 1, text: "x" });
    expect(limited).toMatchObject({ ok: false, retryable: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ ok: false, description: "Forbidden: bot was blocked by the user" }, { status: 403 }));
    const blocked = await sendTelegram({ chatId: 1, text: "x" });
    expect(blocked).toMatchObject({ ok: false, retryable: false });
    expect(JSON.stringify([limited, blocked])).not.toContain("token-value");
  });
});

describe("notification text (email + Telegram)", () => {
  it("new show: real fields + Live Show Radar link; no ticket link or ticket claim when the source gave none", () => {
    const m = renderNotification({ category: "new_show", title: "New show", body: "b", reason: "you follow TEST Band", event: ev() }, "https://radar.example");
    expect(m.text).toContain("TEST Band — TEST Tour");
    expect(m.text).toContain("Where: TEST Hall, Bengaluru");
    expect(m.text).toContain("Tickets: status not confirmed by a source yet");
    expect(m.text).not.toContain("Official ticket link");
    expect(m.text).toContain("https://radar.example/radar/events/11111111-2222-3333-4444-555555555555");
  });
  it("includes the official ticket link and a verified early-bird deadline when the source confirmed them", () => {
    const m = renderNotification(
      {
        category: "new_show",
        title: "t",
        body: "",
        reason: "r",
        event: ev({
          ticket: {
            kind: "early_bird",
            verification: { state: "confirmed" },
            earlyBirdEndsAt: "2027-01-31T18:29:00.000Z",
            bookingUrl: "https://tickets.example/x",
          },
        }),
      },
      "https://radar.example",
    );
    expect(m.text).toContain("Official ticket link: https://tickets.example/x");
    expect(m.text).toMatch(/Early bird ends: /);
  });
  it("booking confirmation links to My bookings", () => {
    const m = renderNotification({ category: "booking_confirmed", title: "Booking recorded", body: "Your booking has been recorded…", reason: "r", event: ev() }, "https://radar.example");
    expect(m.text).toContain("https://radar.example/bookings");
  });
});
