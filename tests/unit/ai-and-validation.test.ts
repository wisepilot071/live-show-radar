import { describe, expect, it } from "vitest";
import { extractionSchema, type Extraction } from "@/integrations/gemini/announcement-extraction";
import { ground, ticketFrom, withKnownOffset } from "@/server/announcements";
import { selectionInputSchema } from "@/server/me";
import { preferencesSchema } from "@/server/repos/profile";
import { sanitizeExternalUrl } from "@/server/safe-fetch";

const TEXT =
  "TEST Fixture Band live in Bengaluru! Saturday 14 November 2026, 7:30 PM at TEST Arena. Early bird tickets are LIVE now on tickets.example.test/tfb";

function extraction(overrides: Partial<Extraction> = {}): Extraction {
  const none = { value: null, evidence: null };
  return {
    is_event_announcement: true,
    announcement_type: "early_bird_available",
    artists: [{ name: "TEST Fixture Band", evidence: "TEST Fixture Band live" }],
    event_title: none,
    date: { value: "2026-11-14", raw_text: "Saturday 14 November 2026", ambiguous: false },
    start_time: { value: "19:30", evidence: "7:30 PM" },
    venue: { value: "TEST Arena", evidence: "at TEST Arena" },
    city: { value: "Bengaluru", evidence: "live in Bengaluru" },
    country: none,
    ticket_url: { value: "tickets.example.test/tfb", evidence: "tickets.example.test/tfb" },
    ticket_sale_opens: none,
    early_bird: { status: "available", ends_at: null, evidence: "Early bird tickets are LIVE now" },
    confidence: "high",
    uncertainties: [],
    ...overrides,
  };
}

describe("Gemini output validation", () => {
  it("accepts a well-formed extraction", () => {
    expect(extractionSchema.safeParse(extraction()).success).toBe(true);
  });
  it("rejects malformed output (wrong date format, unknown enum, missing fields)", () => {
    expect(extractionSchema.safeParse(extraction({ date: { value: "14/11/2026", raw_text: null, ambiguous: false } })).success).toBe(false);
    expect(extractionSchema.safeParse({ ...extraction(), announcement_type: "hype" }).success).toBe(false);
    expect(extractionSchema.safeParse({ is_event_announcement: true }).success).toBe(false);
  });
});

describe("grounding (deterministic checks after the model)", () => {
  it("keeps values whose evidence is in the text", () => {
    const { x, dropped } = ground(extraction(), TEXT);
    expect(dropped).toEqual([]);
    expect(x.venue.value).toBe("TEST Arena");
    expect(x.ticket_url.value).toBe("tickets.example.test/tfb");
  });
  it("drops invented values: unsupported venue, fabricated URL, year not in text, invented artist", () => {
    const { x, dropped } = ground(
      extraction({
        venue: { value: "Madison Square Garden", evidence: "at Madison Square Garden" },
        ticket_url: { value: "https://evil.example/phish", evidence: "tickets.example.test/tfb" },
        date: { value: "2027-11-14", raw_text: "Saturday 14 November", ambiguous: false },
        artists: [{ name: "Coldplay", evidence: "x" }],
      }),
      TEXT.replace("2026", ""),
    );
    expect(dropped).toEqual(expect.arrayContaining(["venue", "ticket_url", "date", "artist:Coldplay"]));
    expect(x.venue.value).toBeNull();
    expect(x.ticket_url.value).toBeNull();
    expect(x.date.value).toBeNull();
    expect(x.artists).toEqual([]);
  });
  it("drops an early-bird claim with no supporting quote", () => {
    const { x } = ground(extraction({ early_bird: { status: "available", ends_at: null, evidence: "made up" } }), TEXT);
    expect(x.early_bird.status).toBe("not_mentioned");
  });
  it("maps announcement types to ticket statuses without inventing availability", () => {
    expect(ticketFrom(extraction()).status).toBe("early_bird");
    expect(ticketFrom(extraction({ announcement_type: "new_show", early_bird: { status: "not_mentioned", ends_at: null, evidence: null } }))).toEqual({
      status: "unknown",
      exposes: false,
    });
    expect(ticketFrom(extraction({ announcement_type: "sold_out" })).status).toBe("sold_out");
  });
});

describe("AI timestamps get a zone only when it's known", () => {
  it("adds IST for a confirmed Indian city; drops otherwise", () => {
    expect(withKnownOffset("2026-11-09T23:59", true)).toBe("2026-11-09T23:59:00+05:30");
    expect(withKnownOffset("2026-11-09T23:59", false)).toBeUndefined();
    expect(withKnownOffset("2026-11-09T23:59:00Z", false)).toBe("2026-11-09T23:59:00Z");
    expect(withKnownOffset("tonight", true)).toBeUndefined();
    expect(withKnownOffset(null, true)).toBeUndefined();
  });
});

describe("API input validation", () => {
  it("preferences: accepts valid, rejects oversized or malformed", () => {
    const ok = {
      location: { primaryCityId: "bengaluru", additionalCityIds: ["mumbai"], includeNationwide: true },
      notifications: { triggers: { new_announcement: true } },
      channelRequests: { email: false, telegram: false },
      method: "manual",
      spotify: "not_connected",
      completedAt: null,
    };
    expect(preferencesSchema.safeParse(ok).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...ok, method: "hack" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...ok, location: { ...ok.location, additionalCityIds: Array(50).fill("x") } }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...ok, completedAt: "yesterday" }).success).toBe(false);
  });
  it("artist selection: requires id/name/origin and a timestamp", () => {
    const sel = { artist: { id: "mbid:x", name: "X", origin: "musicbrainz" }, addedVia: "manual", selectedAt: "2026-10-11T00:00:00Z" };
    expect(selectionInputSchema.safeParse(sel).success).toBe(true);
    expect(selectionInputSchema.safeParse({ ...sel, artist: { ...sel.artist, name: "" } }).success).toBe(false);
    expect(selectionInputSchema.safeParse({ ...sel, selectedAt: "now" }).success).toBe(false);
  });
  it("external URLs: only http(s) survive", () => {
    expect(sanitizeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(sanitizeExternalUrl("https://district.in/x")).toBe("https://district.in/x");
    expect(sanitizeExternalUrl("not a url")).toBeUndefined();
  });
});
