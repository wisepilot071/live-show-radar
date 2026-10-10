import { NextResponse, type NextRequest } from "next/server";
import { MusicBrainzError } from "@/integrations/musicbrainz/client";
import { isDatabaseConfigured } from "@/server/db";
import { rateLimit } from "@/server/guards";
import { log } from "@/server/log";
import {
  ARTIST_QUERY_MAX_LENGTH,
  type ArtistSearchErrorResponse,
  type ArtistSearchResponse,
} from "@/services/artist-search/contract";
import { getActiveArtistSearch } from "@/services/artist-search/active";

export async function GET(request: NextRequest) {
  const adapter = getActiveArtistSearch();
  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");

  if (query.length > ARTIST_QUERY_MAX_LENGTH) {
    return NextResponse.json<ArtistSearchErrorResponse>(
      { error: `Search is limited to ${ARTIST_QUERY_MAX_LENGTH} characters.` },
      { status: 400 },
    );
  }
  // Protect the shared MusicBrainz budget (1 req/s) from a single client.
  if (adapter.sourceId === "live" && query && isDatabaseConfigured()) {
    const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0]!.trim().slice(0, 64);
    try {
      const r = await rateLimit(`search:${ip}`, 60, 60);
      if (!r.allowed) {
        return NextResponse.json<ArtistSearchErrorResponse>(
          { error: "Too many searches. Wait a few seconds and try again." },
          { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds) } },
        );
      }
    } catch (err) {
      log.warn("artist-search", "rate limit check failed; allowing request", { error: err instanceof Error ? err.message : "unknown" });
    }
  }
  if (adapter.sourceId === "live" && query.length > 0 && query.length < 2) {
    return NextResponse.json<ArtistSearchResponse>({ query, source: adapter.sourceId, sourceLabel: adapter.label, artists: [] });
  }

  try {
    const artists = query ? await adapter.search(query, { limit: 10 }) : await adapter.suggestions({ limit: 12 });
    return NextResponse.json<ArtistSearchResponse>(
      { query, source: adapter.sourceId, sourceLabel: adapter.label, artists },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const busy = err instanceof MusicBrainzError && (err.category === "source_rate_limited" || err.category === "timeout");
    log.warn("artist-search", "search failed", { source: adapter.label, category: err instanceof MusicBrainzError ? err.category : "internal" });
    return NextResponse.json<ArtistSearchErrorResponse>(
      { error: busy ? `${adapter.label} is busy right now. Wait a moment and retry.` : `${adapter.label} search is unavailable right now.` },
      { status: busy ? 503 : 502 },
    );
  }
}
