/** Dev diagnostic: run the real news adapter for one or more artists and print what it would store. Uses .env.local. */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}
const { scrapingBeeNewsEvents } = await import("../src/integrations/events/registry");
const names = process.argv.slice(2);
const t0 = Date.now();
const out = await scrapingBeeNewsEvents.fetchForArtists(
  names.map((name, i) => ({ artistId: `diag-${i}`, name, aliases: [] })),
  { deadline: Date.now() + 240_000 } as never,
);
console.log(`took ${Math.round((Date.now() - t0) / 1000)}s`);
if (!out.ok) console.log("FAILED", out.category, out.message);
else {
  console.log("failures:", JSON.stringify(out.artistFailures));
  for (const r of out.records)
    console.log(`${r.localDate} | ${r.cityName} | ${r.venueName ?? "-"} | ${r.title} | ticket=${r.ticket.status} ${r.ticket.url ?? ""} sale=${r.ticket.saleOpensAt ?? ""} | ${r.sourceUrl}`);
}
process.exit(0);
