/**
 * Diagnostic (dev only): real ScrapingBee news search + Gemini read for a few
 * artists, printing timings and what passed each filter. Uses .env.local.
 *   npx vite-node scripts/diag-news.ts "Diljit Dosanjh" "Arijit Singh"
 */
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

const { passesPrefilter, recordFrom, scrapingBeeNewsSearch } = await import("../src/integrations/events/scrapingbee-news");
const { generateJson } = await import("../src/integrations/gemini/client");
const { SYSTEM_INSTRUCTION, buildUserText, extractionJsonSchema, extractionSchema } = await import("../src/integrations/gemini/announcement-extraction");
const { ground } = await import("../src/server/announcements");

const now = new Date();
for (const name of process.argv.slice(2)) {
  const artist = { artistId: name, name, aliases: [] as string[] };
  const t0 = Date.now();
  const results = await scrapingBeeNewsSearch(`"${name}" concert India ${now.getUTCFullYear()}`);
  const t1 = Date.now();
  const candidates = results.map((r) => ({ r, text: [r.title, r.snippet].filter(Boolean).join("\n") })).filter((c) => passesPrefilter(artist, c.text, now));
  console.log(`== ${name}: ${results.length} results in ${t1 - t0}ms, ${candidates.length} pass pre-filter`);
  for (const c of candidates.slice(0, 3)) {
    console.log(`   · ${c.r.source ?? ""} | ${(c.r.title ?? "").slice(0, 90)}`);
    const t2 = Date.now();
    try {
      const { json } = await generateJson({ systemInstruction: SYSTEM_INSTRUCTION, userText: buildUserText(c.text), jsonSchema: extractionJsonSchema });
      const x = extractionSchema.parse(json);
      const { x: g } = ground(x, c.text);
      const rec = recordFrom(artist, c.r, g, now);
      console.log(`     gemini ${Date.now() - t2}ms → date=${g.date.value} city=${g.city.value} type=${g.announcement_type} → ${rec ? `KEEP ${rec.localDate} ${rec.cityName}` : "dropped (no full upcoming date / Indian city)"}`);
    } catch (e) {
      console.log(`     gemini error after ${Date.now() - t2}ms: ${(e as Error).message}`);
    }
  }
}
