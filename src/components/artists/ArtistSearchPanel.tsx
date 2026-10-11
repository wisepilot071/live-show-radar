"use client";

import { Database, Plus, RotateCw, Search, SearchX, X } from "lucide-react";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArtistResult } from "@/components/onboarding/ArtistResult";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { TextField } from "@/components/ui/TextField";
import { createUserEnteredArtist, normalizeArtistName } from "@/domain/artist-identity";
import type { Artist } from "@/domain/types";
import { useArtistSearch } from "@/features/artist-search/useArtistSearch";
import { ARTIST_QUERY_MAX_LENGTH } from "@/services/artist-search/contract";

/**
 * The one artist-search UI, shared by onboarding and the Artists page.
 * Search, keyboard navigation (↓/↑, Esc), ambiguity warning, sample-catalogue
 * label, error + retry, honest empty state, and "add as typed".
 * Selection state is owned by the caller.
 */
export function ArtistSearchPanel({
  isSelected,
  onToggle,
  initialQuery = "",
  onQueryChange,
  allowTyped = true,
  mode = "toggle",
  label = "Search artists",
  autoFocus,
  resultsHeadingAs: ResultsHeading = "h2",
}: {
  isSelected: (artist: Artist) => boolean;
  onToggle: (artist: Artist) => void;
  initialQuery?: string;
  onQueryChange?: (query: string) => void;
  allowTyped?: boolean;
  /** "pick" = choose one match (used to resolve an ambiguous typed entry). */
  mode?: "toggle" | "pick";
  label?: string;
  autoFocus?: boolean;
  resultsHeadingAs?: "h2" | "h3";
}) {
  const [query, setQueryState] = useState(initialQuery);
  const { state: search, retry, normalizedQuery } = useArtistSearch(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  function setQuery(q: string) {
    setQueryState(q);
    onQueryChange?.(q);
  }

  const response = search.phase === "ready" ? search.response : search.previous;
  const results = useMemo(() => response?.artists ?? [], [response]);
  const isSample = response?.source === "sample_catalogue";

  const ambiguousNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of results) {
      const n = normalizeArtistName(a.name);
      counts.set(n, (counts.get(n) ?? 0) + 1);
    }
    return new Set([...counts].filter(([, c]) => c > 1).map(([n]) => n));
  }, [results]);

  const q = normalizeArtistName(normalizedQuery);
  // Offer "add as typed" only when nothing in the results plausibly is what they typed.
  const hasCloseMatch = results.some((a) => [a.name, ...(a.aliases ?? [])].some((n) => normalizeArtistName(n).startsWith(q)));
  const typedArtist = q ? createUserEnteredArtist(normalizedQuery) : null;
  const typedAlreadySelected = typedArtist ? isSelected(typedArtist) : false;
  const searchSettled = search.phase === "ready" && response?.query === normalizedQuery;

  function focusResult(index: number) {
    const items = listRef.current?.querySelectorAll<HTMLButtonElement>("[data-artist-result]");
    if (!items || items.length === 0) return;
    if (index < 0) return inputRef.current?.focus();
    items[Math.min(index, items.length - 1)]?.focus();
  }

  function onInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusResult(0);
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    }
  }

  function onResultKeyDown(index: number) {
    return (e: KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusResult(index + 1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        focusResult(index - 1);
      }
    };
  }

  return (
    <div className="space-y-4">
      <form role="search" onSubmit={(e) => e.preventDefault()}>
        <TextField
          ref={inputRef}
          label={label}
          type="search"
          value={query}
          maxLength={ARTIST_QUERY_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="Try “Prateek Kuhad” or “PCRC”"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          leadingIcon={<Search className="size-5" />}
          hint="Use ↓ to move into results. Case and spacing don't matter."
          trailing={
            query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                className="grid size-11 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
                aria-label="Clear search"
              >
                <X aria-hidden className="size-4" />
              </button>
            ) : null
          }
        />
      </form>

      {response?.source === "live" && (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Database aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Searching <strong className="font-semibold text-fg-secondary">{response.sourceLabel}</strong>, an open music
            database. Each result has a stable id, so same-named artists stay separate.
          </span>
        </p>
      )}

      {isSample && (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Database aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            Searching a small <strong className="font-semibold text-fg-secondary">sample catalogue</strong>. A full
            artist catalogue is connected in a later version
            {allowTyped ? " — until then, add anyone missing as typed." : "."}
          </span>
        </p>
      )}

      {search.phase === "error" && (
        <InlineAlert
          tone="error"
          live
          title="Search didn't work"
          action={
            <Button variant="secondary" onClick={retry} leadingIcon={<RotateCw aria-hidden className="size-4" />}>
              Retry search
            </Button>
          }
        >
          {search.message} Your selected artists are safe.
        </InlineAlert>
      )}

      {search.phase === "loading" && !response && <LoadingIndicator label="Searching…" />}

      {response && (
        <div aria-busy={search.phase === "loading"} className="space-y-3">
          <div className="flex min-h-6 items-center justify-between gap-2">
            <ResultsHeading className="text-sm font-semibold text-fg-secondary">
              {response.query ? `Results for “${response.query}”` : results.length ? "Popular starting points" : "Search"}
            </ResultsHeading>
            {search.phase === "loading" && <span className="text-xs text-fg-muted">Updating…</span>}
          </div>

          {ambiguousNames.size > 0 && (
            <InlineAlert tone="warning">
              More than one artist shares a name here. Check the details under each name before{" "}
              {mode === "pick" ? "choosing" : "adding"}.
            </InlineAlert>
          )}

          {!response.query && results.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong p-4 text-sm text-fg-secondary">
              Start typing an artist&rsquo;s name to search.
            </p>
          ) : results.length > 0 ? (
            <ul ref={listRef} className="space-y-2" aria-label="Search results">
              {results.map((artist, i) => (
                <li key={artist.id}>
                  <ArtistResult
                    artist={artist}
                    selected={isSelected(artist)}
                    ambiguous={ambiguousNames.has(normalizeArtistName(artist.name))}
                    onToggle={() => onToggle(artist)}
                    onKeyDown={onResultKeyDown(i)}
                    labels={mode === "pick" ? { idle: "Use", active: "In list" } : undefined}
                  />
                </li>
              ))}
            </ul>
          ) : (
            searchSettled && (
              <EmptyState icon={SearchX} title={`No match for “${response.query}”`}>
                That artist isn&rsquo;t in the {isSample ? "sample catalogue" : "catalogue"} we can search right now — it
                doesn&rsquo;t mean they don&rsquo;t exist. Check the spelling or try another name they go by
                {allowTyped ? ", or add them as typed below." : "."}
              </EmptyState>
            )
          )}

          {allowTyped && searchSettled && typedArtist && !hasCloseMatch && (
            <Card tone="outline" className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold text-fg">Can&rsquo;t find them?</p>
                <p className="text-sm break-words text-fg-secondary">
                  Add &ldquo;<span className="text-fg">{typedArtist.name}</span>&rdquo; as typed. We&rsquo;ll match it to
                  a real artist record when a full catalogue is connected.
                </p>
              </div>
              <Button
                variant={typedAlreadySelected ? "ghost" : "secondary"}
                onClick={() => onToggle(typedArtist)}
                aria-pressed={typedAlreadySelected}
                leadingIcon={typedAlreadySelected ? undefined : <Plus aria-hidden className="size-4" />}
              >
                {typedAlreadySelected ? "Added as typed · undo" : "Add as typed"}
              </Button>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
