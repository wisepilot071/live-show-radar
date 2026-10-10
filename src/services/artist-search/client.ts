import type { ArtistSearchErrorResponse, ArtistSearchResponse } from "./contract";

export class ArtistSearchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ArtistSearchError";
  }
}

/** Browser-side call to the search API. Empty query returns suggestions. */
export async function fetchArtistSearch(query: string, signal?: AbortSignal): Promise<ArtistSearchResponse> {
  const res = await fetch(`/api/artists/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) {
    let message = "Artist search is unavailable right now.";
    try {
      const body = (await res.json()) as ArtistSearchErrorResponse;
      if (body.error) message = body.error;
    } catch {
      // Non-JSON error body: keep the generic message; status is still reported.
    }
    throw new ArtistSearchError(message, res.status);
  }
  return (await res.json()) as ArtistSearchResponse;
}
