import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@/domain/types";
import { renderArtistDigest } from "@/server/notifications/message";

const ev = (id: string, city: string, date: string, venue?: string): LiveEvent =>
  ({
    id,
    artistIds: ["a"],
    artistNames: ["Diljit Dosanjh"],
    title: `Aura — ${city}`,
    kind: "tour_stop",
    cityName: city,
    venueName: venue,
    countryCode: "IN",
    when: { date, timeZone: "Asia/Kolkata" },
    ticket: { kind: "unknown", verification: { state: "unconfirmed" }, bookingUrl: "https://thumpn.com/tour/x" },
    source: { name: "News announcements (ScrapingBee)" },
  }) as unknown as LiveEvent;

describe("renderArtistDigest", () => {
  it("one message for several shows by one artist, sorted by date, ticket link once", () => {
    const n = (e: LiveEvent) => ({ category: "new_show", title: "t", body: "b", reason: "r", event: e });
    const m = renderArtistDigest([n(ev("2", "Mumbai", "2026-11-27")), n(ev("1", "Bengaluru", "2026-11-29", "Palace Grounds"))], "https://app.test");
    expect(m.subject).toBe("Diljit Dosanjh: 2 new shows — Mumbai, Bengaluru");
    expect(m.text.indexOf("Mumbai (venue not announced yet)")).toBeLessThan(m.text.indexOf("Bengaluru, Palace Grounds"));
    expect(m.text.match(/thumpn\.com/g)).toHaveLength(1);
    expect(m.text).toContain("https://app.test/radar/events/1");
  });
});
