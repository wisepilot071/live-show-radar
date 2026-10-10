import type { Artist } from "@/domain/types";

/** Server-side search adapter. Swap the implementation; the API and UI stay the same. */
export interface ArtistSearchAdapter {
  readonly sourceId: "sample_catalogue" | "live";
  readonly label: string;
  search(query: string, opts: { limit: number }): Promise<Artist[]>;
  /** Starting points shown before the user types. */
  suggestions(opts: { limit: number }): Promise<Artist[]>;
}

/** Shape of GET /api/artists/search. */
export interface ArtistSearchResponse {
  query: string;
  source: ArtistSearchAdapter["sourceId"];
  sourceLabel: string;
  artists: Artist[];
}

export interface ArtistSearchErrorResponse {
  error: string;
}

export const ARTIST_QUERY_MAX_LENGTH = 80;
