import { after } from "next/server";
import { z } from "zod";
import { musicBrainzEvents } from "@/integrations/events/musicbrainz";
import { ticketmasterEvents } from "@/integrations/events/ticketmaster";
import { runDiscovery } from "@/server/ingest/pipeline";
import { log } from "@/server/log";
import type { Artist } from "@/domain/types";
import { fail, ok, readBody } from "@/server/http";
import { meReadRoute, meRoute, selectionInputSchema } from "@/server/me";
import { ArtistResolutionError } from "@/server/repos/artists";
import { clearArtists, followArtist, getProfile, unfollowArtist } from "@/server/repos/profile";

export const maxDuration = 60;

export const GET = meReadRoute("api/me/artists", async (_req, userId) =>
  ok({ selections: userId ? (await getProfile(userId)).selections : [] }),
);

/** Follow an artist. Idempotent: following twice is a no-op (DB primary key). */
export const POST = meRoute("api/me/artists", async (req, userId) => {
  const body = await readBody(req, selectionInputSchema);
  if (!body.ok) return body.response;
  try {
    const selection = await followArtist(userId, { ...body.value, artist: body.value.artist as Artist });
    // Look the new artist up right away, after the response: the free sources only
    // (news costs credits; the scheduled run checks never-checked artists first).
    // The per-profile job lock makes a burst of follows ("Add all") run once.
    after(async () => {
      const sources = [musicBrainzEvents, ticketmasterEvents].filter((s) => s.configStatus().configured);
      if (sources.length === 0) return;
      try {
        await runDiscovery({ trigger: "user", userId, sources, timeBudgetMs: 45_000 });
      } catch (err) {
        log.warn("discovery", "follow-time lookup failed", { error: err instanceof Error ? err.message : String(err) });
      }
    });
    return ok({ selection });
  } catch (err) {
    if (err instanceof ArtistResolutionError) return fail(err.status, err.status === 503 ? "source_unavailable" : "bad_request", err.message);
    throw err;
  }
});

/** Unfollow one (?key=identityKey) or all (?all=1). */
export const DELETE = meRoute("api/me/artists", async (req, userId) => {
  const url = new URL(req.url);
  if (url.searchParams.get("all") === "1") {
    await clearArtists(userId);
    return ok({ removed: "all" });
  }
  const key = z.string().min(1).max(200).safeParse(url.searchParams.get("key"));
  if (!key.success) return fail(400, "bad_request", "Missing artist key.");
  return ok({ removed: await unfollowArtist(userId, key.data) });
});
