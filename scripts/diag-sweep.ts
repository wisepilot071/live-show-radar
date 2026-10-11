/** Dev diagnostic: one real city sweep against the curated catalogue (costs ~34 ScrapingBee credits). Uses .env.local. */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const news = await import("../src/integrations/events/scrapingbee-news");
const { extractListingCached } = await import("../src/server/tour-extraction");
const { getSql } = await import("../src/server/db");
const rows = await getSql()<{ id: string; name: string; aliases: string[] }[]>`
  select distinct a.id, a.name, a.aliases from radar.artists a
  where a.id in (select artist_id from radar.curated_artist_lists) or a.id in (select artist_id from radar.user_artists)`;
const targets = rows.map((r) => ({ artistId: r.id, name: r.name, aliases: r.aliases }));
const t0 = Date.now();
const out = await news.runCitySweep(
  {
    search: news.scrapingBeeNewsSearch,
    fetchArticle: news.scrapingBeeArticle,
    extractListing: extractListingCached,
    extract: async () => { throw new Error("unused"); },
    ground: (x) => ({ x }),
    now: () => new Date(),
    pauseMs: 4000,
  },
  [process.argv[2] ?? "Bengaluru"],
  targets,
  new Date(),
  Date.now() + 240_000,
);
console.log(`${targets.length} targets · ${Math.round((Date.now() - t0) / 1000)}s · aiRateLimited=${out.aiRateLimited}`);
for (const r of out.records) console.log(`${r.localDate} ${r.localTime ?? ""} | ${r.cityName} | ${r.performers[0]?.name} | ${r.venueName ?? "-"} | ticket=${r.ticket.url ?? "-"} | ${r.sourceUrl}`);
process.exit(0);
