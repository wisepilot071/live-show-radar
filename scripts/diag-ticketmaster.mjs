// Dev diagnostic: real Ticketmaster Discovery v2 queries (key from .env.local, never printed).
import { readFileSync } from "node:fs";
const key = readFileSync(".env.local", "utf8").match(/^TICKETMASTER_API_KEY=(.*)$/m)?.[1]?.trim().replace(/^"|"$/g, "");
if (!key) throw new Error("TICKETMASTER_API_KEY missing");
async function q(label, params) {
  const u = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("apikey", key);
  const t = Date.now();
  const r = await fetch(u, { signal: AbortSignal.timeout(10000) });
  const body = await r.json().catch(() => ({}));
  const evs = body._embedded?.events ?? [];
  const page = body.page ?? {};
  console.log(`${label.padEnd(44)} HTTP ${r.status} ${Date.now() - t}ms total=${page.totalElements ?? "-"} pages=${page.totalPages ?? "-"} rate-left=${r.headers.get("rate-limit-available") ?? "-"}`);
  for (const e of evs.slice(0, 3)) {
    const v = e._embedded?.venues?.[0];
    console.log(`   · ${e.dates?.start?.localDate} ${e.dates?.start?.localTime ?? ""} | ${e.name.slice(0, 50)} | ${v?.name ?? "-"}, ${v?.city?.name ?? "-"} ${v?.country?.countryCode ?? ""} | img=${(e.images ?? []).length} price=${e.priceRanges ? JSON.stringify(e.priceRanges[0]) : "-"} | status=${e.dates?.status?.code} | url=${(e.url ?? "").slice(0, 60)}`);
  }
  if (body.errors || body.fault) console.log("   error:", JSON.stringify(body.errors ?? body.fault).slice(0, 200));
}
const music = { classificationName: "music", sort: "date,asc" };
for (const [city, extra] of [["Bengaluru", {}], ["Bangalore", {}], ["Mumbai", {}], ["Delhi", {}], ["New Delhi", {}], ["Chennai", {}], ["Hyderabad", {}], ["Pune", {}]]) {
  await q(`city=${city} IN music`, { city, countryCode: "IN", ...music, ...extra });
  await new Promise((r) => setTimeout(r, 250));
}
await q("countryCode=IN (any classification)", { countryCode: "IN", size: "5" });
await q("countryCode=IN music, date window", { countryCode: "IN", ...music, startDateTime: new Date().toISOString().slice(0, 19) + "Z", endDateTime: new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 19) + "Z" });
await q("latlong Bengaluru r=50km music", { latlong: "12.9716,77.5946", radius: "50", unit: "km", ...music });
for (const a of ["Coldplay", "Ed Sheeran", "Arijit Singh", "Diljit Dosanjh", "Guns N' Roses", "The Chainsmokers"]) {
  await q(`keyword=${a} (worldwide)`, { keyword: a, ...music, size: "5" });
  await q(`keyword=${a} IN`, { keyword: a, countryCode: "IN", ...music });
  await new Promise((r) => setTimeout(r, 250));
}
await q("pagination: Coldplay page=1 size=2", { keyword: "Coldplay", classificationName: "music", size: "2", page: "1" });
await q("empty: nonsense keyword", { keyword: "zzqxv-no-such-artist-1234", countryCode: "IN" });
await q("invalid: size=999", { keyword: "Coldplay", size: "999" });
await q("invalid: bad countryCode", { countryCode: "XX-NOT", classificationName: "music" });
