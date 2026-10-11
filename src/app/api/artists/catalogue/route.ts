import { z } from "zod";
import type { Artist } from "@/domain/types";
import { getSql, isDatabaseConfigured } from "@/server/db";
import { fail, handle, ok } from "@/server/http";
import { rowToArtist, type ArtistRow } from "@/server/repos/artists";

export interface CatalogueEntry {
  artist: Artist;
  category: "international" | "indian";
  /** Curated lists this artist is on (suggestions / discovery test targets). Not a follow. */
  lists: string[];
}

const query = z.object({
  category: z.enum(["all", "international", "indian"]).default("all"),
  q: z.string().trim().max(100).default(""),
});

/**
 * The curated artist catalogue (46 unique artists from 50 list entries),
 * ordered by first list position. Public and read-only: following an
 * artist still goes through /api/me/artists, which re-validates the id.
 */
export const GET = handle("api/artists/catalogue", async (req: Request) => {
  if (!isDatabaseConfigured()) return fail(503, "not_configured", "The artist catalogue needs server storage.");
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = query.safeParse(params);
  if (!parsed.success) return fail(400, "bad_request", "Invalid catalogue query.");
  const { category, q } = parsed.data;
  const rows = await getSql()<(ArtistRow & { category: "international" | "indian"; lists: string[]; first_position: number })[]>`
    select a.*, array_agg(distinct l.list_key) as lists, min(l.position) as first_position
    from radar.artists a join radar.curated_artist_lists l on l.artist_id = a.id
    where a.category is not null
      and (${category} = 'all' or a.category = ${category})
      and (${q} = '' or position(lower(${q}) in lower(a.name)) > 0)
    group by a.id
    order by min(l.position)`;
  const entries: CatalogueEntry[] = rows.map((r) => ({ artist: rowToArtist(r), category: r.category, lists: r.lists }));
  return ok({ entries, total: entries.length }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } });
});
