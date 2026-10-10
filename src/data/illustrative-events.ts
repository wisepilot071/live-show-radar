import type { LiveEvent } from "@/domain/types";

/**
 * ILLUSTRATIVE EVENTS — fictional.
 *
 * Artist names, venues, dates and ticket details below are invented to show
 * how the event card communicates each information state. They do not refer
 * to real performers or real shows. Every record has `origin: "illustrative"`,
 * no `bookingUrl`, and the source is a placeholder, so no ticket action can be
 * rendered for them.
 */
const exampleSource = { id: "example", name: "Example source", origin: "illustrative" as const };
const IST = "Asia/Kolkata";

export const ILLUSTRATIVE_EVENTS: readonly LiveEvent[] = [
  {
    id: "example-1",
    artistIds: ["example:northbound-saints"],
    artistNames: ["Northbound Saints"],
    title: "Northbound Saints — India Tour",
    kind: "tour_stop",
    venueName: "Example Hall, Indiranagar",
    cityName: "Bengaluru",
    cityId: "bengaluru",
    countryCode: "IN",
    when: { date: "2027-02-13", startsAt: "2027-02-13T19:30:00+05:30", timeZone: IST },
    announcedAt: "2026-11-02T10:00:00+05:30",
    ticket: {
      kind: "early_bird",
      verification: { state: "confirmed", lastVerifiedAt: "2026-11-02T10:20:00+05:30" },
      earlyBirdEndsAt: "2026-11-09T23:59:00+05:30",
    },
    source: exampleSource,
    verification: { state: "confirmed", lastVerifiedAt: "2026-11-02T10:20:00+05:30" },
    origin: "illustrative",
  },
  {
    id: "example-2",
    artistIds: ["example:lowtide-radio"],
    artistNames: ["Lowtide Radio"],
    title: "Lowtide Radio live",
    kind: "concert",
    venueName: "Example Grounds, Mahalaxmi",
    cityName: "Mumbai",
    cityId: "mumbai",
    countryCode: "IN",
    when: { date: "2027-03-06", timeZone: IST },
    ticket: {
      kind: "unknown",
      verification: { state: "unconfirmed", note: "Mentioned in one post; no supported source lists it yet." },
    },
    source: exampleSource,
    verification: { state: "unconfirmed" },
    origin: "illustrative",
  },
  {
    id: "example-3",
    artistIds: ["example:kite-season"],
    artistNames: ["Kite Season", "and others"],
    title: "Example Weekender festival",
    kind: "festival",
    venueName: "Example Fields",
    cityName: "Goa",
    cityId: "goa",
    countryCode: "IN",
    when: { timeZone: IST },
    ticket: {
      kind: "announced_not_on_sale",
      verification: { state: "stale", lastVerifiedAt: "2026-09-12T08:00:00+05:30" },
    },
    source: exampleSource,
    verification: { state: "stale", lastVerifiedAt: "2026-09-12T08:00:00+05:30" },
    origin: "illustrative",
  },
  {
    id: "example-4",
    artistIds: ["example:paper-monsoon"],
    artistNames: ["Paper Monsoon"],
    title: "Paper Monsoon — Sold-out night",
    kind: "concert",
    venueName: "Example Auditorium, Adyar",
    cityName: "Chennai",
    cityId: "chennai",
    countryCode: "IN",
    when: { date: "2027-01-23", startsAt: "2027-01-23T20:00:00+05:30", timeZone: IST },
    announcedAt: "2026-08-20T11:00:00+05:30",
    ticket: {
      kind: "sold_out",
      verification: { state: "confirmed", lastVerifiedAt: "2026-10-09T18:00:00+05:30" },
    },
    source: exampleSource,
    verification: { state: "confirmed", lastVerifiedAt: "2026-10-09T18:00:00+05:30" },
    origin: "illustrative",
  },
  {
    id: "example-5",
    artistIds: ["example:saffron-static"],
    artistNames: ["Saffron Static"],
    title: "Saffron Static — rescheduled show",
    kind: "concert",
    venueName: "Example Club, Koregaon Park",
    cityName: "Pune",
    cityId: "pune",
    countryCode: "IN",
    when: { date: "2027-04-10", timeZone: IST },
    announcedAt: "2026-07-01T10:00:00+05:30",
    ticket: {
      kind: "postponed",
      verification: {
        state: "confirmed",
        lastVerifiedAt: "2026-10-08T12:00:00+05:30",
        note: "Moved from an earlier date. Existing tickets carry over, per the source.",
      },
    },
    source: exampleSource,
    verification: { state: "confirmed", lastVerifiedAt: "2026-10-08T12:00:00+05:30" },
    origin: "illustrative",
  },
  {
    id: "example-6",
    artistIds: ["example:northbound-saints"],
    artistNames: ["Northbound Saints"],
    title: "Northbound Saints — second date",
    kind: "tour_stop",
    venueName: "Example Arena, Whitefield",
    cityName: "Bengaluru",
    cityId: "bengaluru",
    countryCode: "IN",
    when: { date: "2027-02-14", timeZone: IST },
    ticket: {
      kind: "unknown",
      verification: { state: "unavailable", note: "The ticketing source couldn't be checked." },
    },
    source: exampleSource,
    verification: { state: "pending" },
    origin: "illustrative",
  },
];

export function findIllustrativeEvent(id: string): LiveEvent | undefined {
  return ILLUSTRATIVE_EVENTS.find((e) => e.id === id);
}
