import { describe, expect, it } from "vitest";
import { recordsFromShows } from "@/integrations/events/scrapingbee-news";
import { articleText, groundListing, groundTour, pickTicketLinks, type TourExtraction } from "@/integrations/gemini/tour-extraction";

const NOW = new Date("2026-10-11T10:00:00Z");
const ARTIST = { artistId: "a1", name: "Arijit Singh", aliases: [] as string[] };

const HTML = `<html><head><script>var x = "March 1: Fake";</script></head><body>
<nav>menu</nav>
<article>
<h1>Arijit Singh Announces 9-City India Tour For 2027</h1>
<p>Arijit Singh will tour India in 2027. General sale opens October 13, 2026, 2 pm on thumpN.</p>
<ul><li>January 9, 2027 - Ahmedabad</li><li>March 13, 2027 - Bengaluru</li><li>May 1, 2027 - Indore</li></ul>
<p>Book at <a href="https://thumpn.com/tour/VEVCFY/arijit-singh-india-tour?utm_source=PR&amp;utm_medium=Online">thumpN</a>.
Also see <a href="https://in.bookmyshow.com/events/other-artist">another show</a> and <a href="http://thumpn.com/tour/x/arijit">insecure</a>.</p>
${"<p>filler text for length.</p>".repeat(80)}
</article></body></html>`;

const extraction = (dates: TourExtraction["dates"], over: Partial<TourExtraction> = {}): TourExtraction => ({
  is_concert_announcement: true,
  artist: "Arijit Singh",
  tour_name: { value: "India Tour", evidence: "9-City India Tour" },
  dates,
  general_sale_opens: { value: "2026-10-13T14:00:00+05:30", evidence: "General sale opens October 13, 2026, 2 pm" },
  ticket_platform: { value: "thumpN", evidence: "on thumpN" },
  ...over,
});

describe("articleText", () => {
  it("keeps article text, drops scripts/nav, puts list items on their own lines", () => {
    const t = articleText(HTML);
    expect(t).toContain("January 9, 2027 - Ahmedabad\nMarch 13, 2027 - Bengaluru");
    expect(t).not.toContain("Fake");
    expect(t).not.toContain("menu");
  });
});

describe("pickTicketLinks", () => {
  it("takes only https links on ticketing hosts that name the artist, without utm params", () => {
    expect(pickTicketLinks(HTML, "Arijit Singh")).toEqual(["https://thumpn.com/tour/VEVCFY/arijit-singh-india-tour"]);
  });
  it("returns nothing when no link names the artist", () => {
    expect(pickTicketLinks(HTML, "Coldplay")).toEqual([]);
  });
});

describe("groundTour", () => {
  const text = articleText(HTML);
  it("keeps dates whose quote is in the article and names the city, day and month", () => {
    const g = groundTour(
      extraction([
        { date: "2027-01-09", city: "Ahmedabad", venue: null, evidence: "January 9, 2027 - Ahmedabad" },
        { date: "2027-03-13", city: "Bengaluru", venue: null, evidence: "March 13, 2027 - Bengaluru" },
        { date: "2027-05-01", city: "Indore", venue: null, evidence: "May 1, 2027 - Indore" },
      ]),
      text,
      ARTIST,
      NOW,
    );
    expect(g.shows.map((s) => `${s.date} ${s.city.id}`)).toEqual(["2027-01-09 ahmedabad", "2027-03-13 bengaluru", "2027-05-01 indore"]);
    expect(g.generalSaleOpensAt).toBe("2026-10-13T08:30:00.000Z");
    expect(g.ticketPlatform).toBe("thumpN");
  });

  it("drops invented quotes, wrong days, wrong cities, past dates and unknown cities", () => {
    const g = groundTour(
      extraction([
        { date: "2027-02-20", city: "Mumbai", venue: null, evidence: "February 20, 2027 - Mumbai" }, // not in article
        { date: "2027-03-14", city: "Bengaluru", venue: null, evidence: "March 13, 2027 - Bengaluru" }, // day mismatch
        { date: "2027-01-09", city: "Pune", venue: null, evidence: "January 9, 2027 - Ahmedabad" }, // city not in quote
        { date: "2025-01-09", city: "Ahmedabad", venue: null, evidence: "January 9, 2027 - Ahmedabad" }, // past + wrong year
        { date: "2027-03-13", city: "Atlantis", venue: null, evidence: "March 13, 2027 - Bengaluru" }, // not an Indian city
      ]),
      text,
      ARTIST,
      NOW,
    );
    expect(g.shows).toEqual([]);
    expect(g.dropped).toBe(5);
  });

  it("returns no shows when the article is about a different artist", () => {
    const g = groundTour(
      extraction([{ date: "2027-03-13", city: "Bengaluru", venue: null, evidence: "March 13, 2027 - Bengaluru" }], { artist: "Someone Else" }),
      text,
      ARTIST,
      NOW,
    );
    expect(g.shows).toEqual([]);
  });

  it("builds one record per show, stable across articles, tickets unverified", () => {
    const g = groundTour(
      extraction([{ date: "2027-03-13", city: "Bangalore", venue: null, evidence: "March 13, 2027 - Bengaluru" }]),
      text,
      ARTIST,
      NOW,
    );
    const a = recordsFromShows(ARTIST, g.shows, { articleUrl: "https://a.example/1", generalSaleOpensAt: g.generalSaleOpensAt, ticketUrl: "https://thumpn.com/t" }, NOW);
    const b = recordsFromShows(ARTIST, g.shows, { articleUrl: "https://b.example/2" }, NOW);
    expect(a[0]!.sourceEventId).toBe(b[0]!.sourceEventId);
    expect(a[0]!.cityName).toBe("Bengaluru");
    expect(a[0]!.ticket).toMatchObject({ status: "announced_not_on_sale", sourceExposesAvailability: false, url: "https://thumpn.com/t" });
  });
});

describe("groundListing (city sweep)", () => {
  const text =
    "Concerts in Bengaluru this November 2026\nPrateek Kuhad plays Phoenix Arena on November 21, 2026 at 7 pm.\nDiljit Dosanjh — Bengaluru, December 5, 2026.\nSome Band — Bengaluru, November 30, 2026.";
  const targets = [
    { artistId: "pk", name: "Prateek Kuhad", aliases: [] },
    { artistId: "dd", name: "Diljit Dosanjh", aliases: [] },
  ];
  it("keeps grounded shows of target artists (with a stated time), ignores everyone else", () => {
    const shows = groundListing(
      {
        shows: [
          { artist: "Prateek Kuhad", date: "2026-11-21", time: "19:00", city: "Bengaluru", venue: "Phoenix Arena", evidence: "Prateek Kuhad plays Phoenix Arena on November 21, 2026 at 7 pm" },
          { artist: "Diljit Dosanjh", date: "2026-12-05", time: "20:00", city: "Bengaluru", venue: null, evidence: "Diljit Dosanjh — Bengaluru, December 5, 2026" },
          { artist: "Some Band", date: "2026-11-30", time: null, city: "Bengaluru", venue: null, evidence: "Some Band — Bengaluru, November 30, 2026" },
        ],
      },
      text,
      targets,
      NOW,
      ["bengaluru"], // swept city: the Prateek quote omits "Bengaluru" (it's in the headline)
    );
    expect(shows.map((s) => [s.target.artistId, s.date, s.city.id, s.time ?? null, s.venue ?? null])).toEqual([
      ["pk", "2026-11-21", "bengaluru", "19:00", "Phoenix Arena"],
      ["dd", "2026-12-05", "bengaluru", null, null], // time not stated in the quote → dropped
    ]);
  });
  it("drops a show whose quote doesn't name the artist", () => {
    const shows = groundListing(
      { shows: [{ artist: "Diljit Dosanjh", date: "2026-11-30", time: null, city: "Bengaluru", venue: null, evidence: "Some Band — Bengaluru, November 30, 2026" }] },
      text,
      targets,
      NOW,
    );
    expect(shows).toEqual([]);
  });
});
