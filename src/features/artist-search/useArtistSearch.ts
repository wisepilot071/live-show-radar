"use client";

import { useCallback, useEffect, useState } from "react";
import { ArtistSearchError, fetchArtistSearch } from "@/services/artist-search/client";
import type { ArtistSearchResponse } from "@/services/artist-search/contract";

export type ArtistSearchState =
  | { phase: "loading"; previous?: ArtistSearchResponse }
  | { phase: "ready"; response: ArtistSearchResponse }
  | { phase: "error"; message: string; previous?: ArtistSearchResponse };

const DEBOUNCE_MS = 180;

type Fetched = { key: string } & ({ ok: true; response: ArtistSearchResponse } | { ok: false; message: string });

/**
 * Debounced, cancellable search against /api/artists/search.
 * Only fetched results are stored (keyed by the request); "loading" is
 * derived when the stored result belongs to an older request, which also
 * keeps the previous results visible so the list doesn't jump.
 */
export function useArtistSearch(query: string) {
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [lastGood, setLastGood] = useState<ArtistSearchResponse | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);
  const normalized = query.trim().replace(/\s+/g, " ");
  const key = `${attempt}|${normalized}`;

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetchArtistSearch(normalized, controller.signal)
        .then((response) => {
          setFetched({ key, ok: true, response });
          setLastGood(response);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setFetched({ key, ok: false, message: err instanceof ArtistSearchError ? err.message : "Artist search is unavailable right now." });
        });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalized, key]);

  const state: ArtistSearchState =
    !fetched || fetched.key !== key
      ? { phase: "loading", previous: lastGood }
      : fetched.ok
        ? { phase: "ready", response: fetched.response }
        : { phase: "error", message: fetched.message, previous: lastGood };

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry, normalizedQuery: normalized };
}
