import { z } from "zod";
import type { Artist } from "@/domain/types";
import { fail, ok, readBody } from "@/server/http";
import { meReadRoute, meRoute, selectionInputSchema } from "@/server/me";
import { ArtistResolutionError } from "@/server/repos/artists";
import { clearArtists, followArtist, getProfile, unfollowArtist } from "@/server/repos/profile";

export const GET = meReadRoute("api/me/artists", async (_req, userId) =>
  ok({ selections: userId ? (await getProfile(userId)).selections : [] }),
);

/** Follow an artist. Idempotent: following twice is a no-op (DB primary key). */
export const POST = meRoute("api/me/artists", async (req, userId) => {
  const body = await readBody(req, selectionInputSchema);
  if (!body.ok) return body.response;
  try {
    const selection = await followArtist(userId, { ...body.value, artist: body.value.artist as Artist });
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
