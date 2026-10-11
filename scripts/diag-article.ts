/** Dev diagnostic: tour-read ONE article for one artist (1 ScrapingBee credit + 1 Gemini call). Uses .env.local. */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const [url, name] = process.argv.slice(2);
const { scrapingBeeArticle } = await import("../src/integrations/events/scrapingbee-news");
const { articleText, groundTour, pickTicketLinks } = await import("../src/integrations/gemini/tour-extraction");
const { extractTourCached } = await import("../src/server/tour-extraction");
const html = await scrapingBeeArticle(url!);
const text = articleText(html);
const g = groundTour(await extractTourCached(text), text, { name: name!, aliases: [] }, new Date());
console.log(`artistMatches=${g.artistMatches} dropped=${g.dropped} tour=${g.tourName ?? "-"} sale=${g.generalSaleOpensAt ?? "-"} ticket=${pickTicketLinks(html, name!)[0] ?? "-"}`);
for (const s of g.shows) console.log(`${s.date} | ${s.city.name} | ${s.venue ?? "-"}`);
process.exit(0);
