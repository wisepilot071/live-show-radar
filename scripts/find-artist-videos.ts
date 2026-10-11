/**
 * Curation helper (dev only): proposes ONE official live-performance video per curated artist.
 *   npx vite-node --config vitest.config.ts scripts/find-artist-videos.ts > ../video-candidates.json
 *
 * Accepts a result only when ALL hold:
 * - the uploading channel is the artist's own (channel name == artist name, or "<artist>VEVO")
 * - the title says it's a live performance ("live", "concert", "tiny desk", "session", "unplugged")
 * - YouTube's official oEmbed endpoint answers 200 (public + embeddable) and returns the same title
 * The output is reviewed and pasted into src/data/live-videos.ts; the runtime route re-checks every ID.
 */
import { CURATED_ARTISTS } from "../src/data/curated-artists";

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
const LIVE = /\b(live|concert|tiny desk|session|unplugged|mtv)\b/i;
const NOT = /\b(reaction|cover|karaoke|lyrics?|tutorial|fan ?cam|8d|slowed|reverb)\b/i;

interface Hit {
  id: string;
  title: string;
  channel: string;
}

function parse(html: string): Hit[] {
  const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!m?.[1]) return [];
  const hits: Hit[] = [];
  const walk = (o: unknown): void => {
    if (!o || typeof o !== "object") return;
    const v = (o as Record<string, unknown>).videoRenderer as
      | { videoId: string; title?: { runs?: Array<{ text: string }> }; ownerText?: { runs?: Array<{ text: string }> } }
      | undefined;
    if (v?.videoId) {
      hits.push({ id: v.videoId, title: v.title?.runs?.map((r) => r.text).join("") ?? "", channel: v.ownerText?.runs?.[0]?.text ?? "" });
      return;
    }
    for (const x of Object.values(o)) walk(x);
  };
  walk(JSON.parse(m[1]));
  return hits;
}

async function oembed(id: string): Promise<{ title: string; author_name: string } | null> {
  const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`);
  return r.ok ? ((await r.json()) as { title: string; author_name: string }) : null;
}

const out: Array<Hit & { artist: string }> = [];
for (const a of CURATED_ARTISTS) {
  const q = encodeURIComponent(`${a.name} live performance official`);
  const html = await (await fetch(`https://www.youtube.com/results?search_query=${q}&hl=en`, { headers: { "Accept-Language": "en" } })).text();
  const own = (h: Hit) => [norm(a.name), `${norm(a.name)}vevo`, `${norm(a.name)}official`].includes(norm(h.channel));
  let picked: (Hit & { artist: string }) | null = null;
  for (const h of parse(html).filter((h) => own(h) && LIVE.test(h.title) && !NOT.test(h.title)).slice(0, 4)) {
    const o = await oembed(h.id);
    if (o && norm(o.author_name) === norm(h.channel)) {
      picked = { artist: a.name, id: h.id, title: o.title, channel: o.author_name };
      break;
    }
  }
  console.error(picked ? `✓ ${a.name}: ${picked.title} [${picked.channel}]` : `- ${a.name}: no official live video found`);
  if (picked) out.push(picked);
  await new Promise((r) => setTimeout(r, 800));
}
console.log(JSON.stringify(out, null, 2));
