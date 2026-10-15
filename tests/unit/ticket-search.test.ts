import { describe, expect, it } from "vitest";
import { urlMatchesShow } from "@/integrations/gemini/ticket-search";

const SHREYA = { artistName: "Shreya Ghoshal", cityId: "bengaluru", date: "2026-11-22" };

describe("urlMatchesShow (ticket pages found by web search)", () => {
  it("accepts an official ticketing page naming the artist and city", () => {
    expect(urlMatchesShow("https://www.district.in/events/shreya-ghoshal-the-unstoppable-india-tour-bengaluru-buy-tickets", SHREYA)).toBe(true);
    expect(urlMatchesShow("https://in.bookmyshow.com/events/shreya-ghoshal-live-bangalore/ET0001", SHREYA)).toBe(true); // alias
  });

  it("rejects unofficial sites, even with the right words (could be a scam)", () => {
    expect(urlMatchesShow("https://www.alldaymusic.club/events/bengaluru/shreya-ghoshal-bengaluru-2026-11-22", SHREYA)).toBe(false);
    expect(urlMatchesShow("https://www.instagram.com/p/shreya-ghoshal-bengaluru-tickets", SHREYA)).toBe(false);
  });

  it("rejects a page for another city, a generic tour page, or another date", () => {
    expect(urlMatchesShow("https://www.district.in/events/shreya-ghoshal-the-unstoppable-india-tour-kolkata-buy-tickets", SHREYA)).toBe(false);
    expect(urlMatchesShow("https://www.district.in/events/shreya-ghoshal-the-unstoppable-tour-2026-27-tour-ticket-booking", SHREYA)).toBe(false);
    expect(urlMatchesShow("https://www.district.in/events/shreya-ghoshal-bengaluru-2027-01-05", SHREYA)).toBe(false);
  });

  it("needs every word of the artist's name", () => {
    expect(urlMatchesShow("https://www.district.in/events/shreya-live-bengaluru", SHREYA)).toBe(false);
    expect(urlMatchesShow("https://www.district.in/events/gunsnroses-bengaluru-2026", { artistName: "Guns N’ Roses", cityId: "bengaluru", date: "2026-11-14" })).toBe(true);
  });
});
