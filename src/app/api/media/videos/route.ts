import { NextResponse } from "next/server";
import { CURATED_LIVE_VIDEOS, CURATED_LIVE_VIDEOS_VERIFIED_AT, type CuratedLiveVideo } from "@/data/live-videos";
import { log } from "@/server/log";

/**
 * Curated live-performance videos, re-checked against YouTube's official
 * oEmbed endpoint (no API key needed):
 *   200 → public and embeddable (real title/channel/thumbnail returned)
 *   401/403 → exists but embedding is disabled → card links to YouTube instead
 *   404/400 → deleted, private or invalid → dropped
 *   network error / timeout → kept as "unchecked"; the player's own error
 *   handling covers it if it turns out to be unavailable
 * Fixed IDs only (no user input), so there's no SSRF surface. Independent of
 * every other feature: if this fails, only the video section is affected.
 */
export const revalidate = 21600; // re-check every 6 hours

export type LiveVideoStatus = "embeddable" | "embedding_disabled" | "unchecked";

export interface LiveVideo extends CuratedLiveVideo {
  thumbnailUrl: string;
  status: LiveVideoStatus;
  source: "curated";
}

async function check(v: CuratedLiveVideo): Promise<LiveVideo | null> {
  const fallbackThumb = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${v.id}`)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: "error", next: { revalidate } });
    if (res.status === 401 || res.status === 403) {
      return { ...v, thumbnailUrl: fallbackThumb, status: "embedding_disabled", source: "curated" };
    }
    if (!res.ok) return null; // removed, private or invalid: don't show it
    const j = (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string };
    const thumb = j.thumbnail_url && /^https:\/\/i\.ytimg\.com\//.test(j.thumbnail_url) ? j.thumbnail_url : fallbackThumb;
    return {
      ...v,
      title: j.title?.trim() || v.title,
      channel: j.author_name?.trim() || v.channel,
      thumbnailUrl: thumb,
      status: "embeddable",
      source: "curated",
    };
  } catch {
    return { ...v, thumbnailUrl: fallbackThumb, status: "unchecked", source: "curated" };
  }
}

export async function GET() {
  const checked = await Promise.all(CURATED_LIVE_VIDEOS.map(check));
  const videos = checked.filter((v): v is LiveVideo => v !== null);
  const dropped = CURATED_LIVE_VIDEOS.length - videos.length;
  if (dropped > 0) log.warn("media.videos", "curated videos unavailable", { dropped });
  return NextResponse.json(
    { ok: true, data: { videos, curatedVerifiedAt: CURATED_LIVE_VIDEOS_VERIFIED_AT } },
    { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } },
  );
}
