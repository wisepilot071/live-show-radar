import { z } from "zod";
import type { Artist } from "@/domain/types";
import { fail, ok, readBody } from "@/server/http";
import { meRoute, selectionInputSchema } from "@/server/me";
import { ArtistResolutionError } from "@/server/repos/artists";
import { replaceArtist } from "@/server/repos/profile";

/** Atomically swap one followed artist for another (e.g. typed name → MusicBrainz record). */
export const POST = meRoute("api/me/artists/replace", async (req, userId) => {
  const body = await readBody(req, z.object({ fromKey: z.string().min(1).max(200), selection: selectionInputSchema }));
  if (!body.ok) return body.response;
  try {
    const sel = body.value.selection;
    return ok({ selection: await replaceArtist(userId, body.value.fromKey, { ...sel, artist: sel.artist as Artist }) });
  } catch (err) {
    if (err instanceof ArtistResolutionError) return fail(err.status, err.status === 503 ? "source_unavailable" : "bad_request", err.message);
    throw err;
  }
});
