import { SAMPLE_ARTISTS } from "@/data/sample-artists";
import { artistIdentityKey, createUserEnteredArtist } from "@/domain/artist-identity";
import type { Artist } from "@/domain/types";
import { mbGet, MusicBrainzError, type MbArtist } from "@/integrations/musicbrainz/client";
import { getSql, type Sql } from "@/server/db";

/**
 * Shared artist catalogue. Clients never define catalogue records: the
 * server re-derives each artist from its origin before storing it —
 *   musicbrainz → fetched from MusicBrainz by MBID (client fields ignored)
 *   sample      → must exist in the bundled sample catalogue
 *   user_entered → only the typed name is kept (no identity claim)
 * so one user can't poison the catalogue for others.
 */
export class ArtistResolutionError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 503,
  ) {
    super(message);
  }
}

export interface ArtistRow {
  id: string;
  catalogue_key: string;
  name: string;
  disambiguation: string | null;
  country: string | null;
  genres: string[];
  aliases: string[];
  image_url: string | null;
  musicbrainz_id: string | null;
  spotify_id: string | null;
  origin: Artist["origin"];
}

export function rowToArtist(r: ArtistRow): Artist {
  return {
    id: r.catalogue_key,
    name: r.name,
    aliases: r.aliases.length ? r.aliases : undefined,
    disambiguation: r.disambiguation ?? undefined,
    country: r.country ?? undefined,
    genres: r.genres.length ? r.genres : undefined,
    imageUrl: r.image_url ?? undefined,
    externalIds:
      r.musicbrainz_id || r.spotify_id
        ? { musicbrainz: r.musicbrainz_id ?? undefined, spotify: r.spotify_id ?? undefined }
        : undefined,
    origin: r.origin,
  };
}

const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function mbArtistToArtist(a: MbArtist): Artist {
  const country = a.country ? (new Intl.DisplayNames(["en"], { type: "region" }).of(a.country) ?? a.country) : a.area?.name;
  return {
    id: `mbid:${a.id}`,
    name: a.name,
    aliases: a.aliases?.map((x) => x.name).filter((n) => n !== a.name).slice(0, 8),
    disambiguation: a.disambiguation || undefined,
    country,
    // MusicBrainz tags mix genres with places/nationalities; drop the obvious non-genres.
    genres: a.tags
      ?.filter((t) => {
        const n = t.name.toLowerCase();
        return n !== country?.toLowerCase() && n !== a.area?.name?.toLowerCase() && !/^(indian|british|american|english|seen live)$/.test(n);
      })
      .sort((x, y) => y.count - x.count)
      .slice(0, 2)
      .map((t) => t.name.replace(/\b\w/g, (c) => c.toUpperCase())),
    externalIds: { musicbrainz: a.id },
    origin: "musicbrainz",
  };
}

/** Server-side canonical version of a client-supplied artist. */
async function resolveTrusted(input: Artist, sql: Sql): Promise<Artist> {
  const mbid = input.externalIds?.musicbrainz ?? (input.id.startsWith("mbid:") ? input.id.slice(5) : undefined);
  if (mbid) {
    if (!MBID.test(mbid)) throw new ArtistResolutionError("That MusicBrainz id isn't valid.", 400);
    const [known] = await sql<ArtistRow[]>`select * from radar.artists where musicbrainz_id = ${mbid}`;
    if (known) return rowToArtist(known);
    try {
      return mbArtistToArtist(await mbGet<MbArtist>(`artist/${mbid}`, { inc: "aliases+tags" }));
    } catch (err) {
      if (err instanceof MusicBrainzError && err.category === "source_bad_response") {
        throw new ArtistResolutionError("MusicBrainz has no artist with that id.", 400);
      }
      throw new ArtistResolutionError("Couldn't confirm this artist with MusicBrainz right now. Try again shortly.", 503);
    }
  }
  if (input.origin === "sample_catalogue") {
    const sample = SAMPLE_ARTISTS.find((a) => a.id === input.id);
    if (!sample) throw new ArtistResolutionError("That sample artist doesn't exist.", 400);
    return sample;
  }
  if (input.origin === "user_entered") {
    const name = input.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 120) throw new ArtistResolutionError("Artist names must be 1–120 characters.", 400);
    return createUserEnteredArtist(name);
  }
  throw new ArtistResolutionError("This kind of artist can't be added yet.", 400);
}

/** Inserts or refreshes a catalogue artist; returns its row id. */
export async function upsertCatalogueArtist(input: Artist, sql: Sql = getSql()): Promise<{ rowId: string; artist: Artist }> {
  const a = await resolveTrusted(input, sql);
  const key = artistIdentityKey(a);
  const [row] = await sql<{ id: string }[]>`
    insert into radar.artists
      (catalogue_key, name, disambiguation, country, genres, aliases, image_url, musicbrainz_id, spotify_id, origin)
    values
      (${key}, ${a.name}, ${a.disambiguation ?? null}, ${a.country ?? null}, ${a.genres ?? []}, ${a.aliases ?? []},
       ${a.imageUrl ?? null}, ${a.externalIds?.musicbrainz ?? null}, ${a.externalIds?.spotify ?? null}, ${a.origin})
    on conflict (catalogue_key) do update set
      name = excluded.name, disambiguation = excluded.disambiguation, country = excluded.country,
      genres = excluded.genres, aliases = excluded.aliases, updated_at = now()
    returning id`;
  return { rowId: row!.id, artist: { ...a, id: key } };
}
