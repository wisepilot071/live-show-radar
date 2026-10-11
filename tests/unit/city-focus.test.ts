import { describe, expect, it } from "vitest";
import type { LiveEvent } from "@/domain/types";
import { focusByCity } from "@/features/discovery/city-focus";

const NOW = new Date("2026-10-11T10:00:00Z");
function ev(id: string, artist: string, cityId: string, date: string): LiveEvent {
  return {
    id,
    artistIds: [artist],
    artistNames: [artist],
    title: id,
    kind: "tour_stop",
    cityName: cityId,
    cityId,
    countryCode: "IN",
    when: { date, timeZone: "Asia/Kolkata" },
  } as unknown as LiveEvent;
}

const TOUR = [
  ev("ahm", "arijit", "ahmedabad", "2027-01-09"),
  ev("mum", "arijit", "mumbai", "2027-02-20"),
  ev("blr", "arijit", "bengaluru", "2027-03-13"),
];

describe("focusByCity", () => {
  it("Bengaluru user: only the Bengaluru show of a multi-city tour", () => {
    expect(focusByCity(TOUR, "bengaluru", NOW).events.map((e) => e.id)).toEqual(["blr"]);
  });
  it("Mumbai user: their city first", () => {
    expect(focusByCity(TOUR, "mumbai", NOW).events.map((e) => e.id)).toEqual(["mum"]);
  });
  it("Pune user with no Pune show: Bengaluru second", () => {
    expect(focusByCity(TOUR, "pune", NOW).events.map((e) => e.id)).toEqual(["blr"]);
  });
  it("no home or Bengaluru show: other cities, but only within the next 2 months", () => {
    const r = focusByCity(
      [ev("del-soon", "x", "delhi", "2026-11-20"), ev("hyd-later", "x", "hyderabad", "2027-02-01")],
      "bengaluru",
      NOW,
    );
    expect(r.events.map((e) => e.id)).toEqual(["del-soon"]);
    expect(r.hidden).toBe(1);
  });
  it("each artist is decided separately", () => {
    const r = focusByCity([...TOUR, ev("goa", "y", "goa", "2026-12-01")], "bengaluru", NOW);
    expect(r.events.map((e) => e.id).sort()).toEqual(["blr", "goa"]);
  });
});
