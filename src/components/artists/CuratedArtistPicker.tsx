"use client";

import { Check, Plus, RotateCw, Search } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { CatalogueEntry } from "@/app/api/artists/catalogue/route";
import { Button } from "@/components/ui/Button";
import { normalizeArtistName } from "@/domain/artist-identity";
import type { Artist } from "@/domain/types";
import { cn } from "@/lib/cn";

type Category = "all" | "international" | "indian";
type Load = { phase: "loading" } | { phase: "ready"; entries: CatalogueEntry[] } | { phase: "error"; message: string };
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

const FILTERS: Array<{ id: Category; label: string }> = [
  { id: "all", label: "All" },
  { id: "international", label: "International" },
  { id: "indian", label: "Indian" },
];

/**
 * The curated catalogue (46 artists) with search and category filters.
 * Add/Remove goes through the caller's existing follow action, so it saves
 * to the same per-profile watchlist as every other way of adding artists.
 */
export function CuratedArtistPicker({
  isSelected,
  onToggle,
  onAddMany,
}: {
  isSelected: (artist: Artist) => boolean;
  onToggle: (artist: Artist) => void;
  /** Adds every shown artist that isn't selected yet (respects search + category). */
  onAddMany?: (artists: Artist[]) => Promise<void> | void;
}) {
  const [adding, setAdding] = useState(false);
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [nonce, setNonce] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const searchId = useId();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/artists/catalogue", { signal: controller.signal })
      .then(async (r) => {
        const body = (await r.json()) as Envelope<{ entries: CatalogueEntry[] }>;
        if (!body.ok) throw new Error(body.error.message);
        setLoad({ phase: "ready", entries: body.data.entries });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setLoad({ phase: "error", message: err instanceof Error ? err.message : "Couldn't load artists." });
      });
    return () => controller.abort();
  }, [nonce]);

  const shown = useMemo(() => {
    if (load.phase !== "ready") return [];
    const q = normalizeArtistName(query);
    return load.entries.filter((e) => (category === "all" || e.category === category) && (!q || normalizeArtistName(e.artist.name).includes(q)));
  }, [load, query, category]);

  return (
    <section aria-label="Artist catalogue" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <label htmlFor={searchId} className="sr-only">
            Search artists
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-fg-muted" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search artists…"
            className="min-h-12 w-full rounded-full border border-line-strong bg-surface pr-4 pl-11 text-base text-fg placeholder:text-fg-muted focus:border-fg focus:outline-none"
          />
        </div>
        <div role="group" aria-label="Filter by category" className="flex gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={category === f.id}
              onClick={() => setCategory(f.id)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors",
                category === f.id ? "border-ink bg-ink text-on-ink" : "border-line bg-surface text-fg-secondary hover:border-fg-muted hover:text-fg",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {load.phase === "loading" && (
        <ul aria-label="Loading artists" className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} aria-hidden className="h-[4.25rem] animate-pulse rounded-xl border border-line bg-surface-2/60" />
          ))}
        </ul>
      )}
      {load.phase === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-urgent/40 bg-urgent/[0.07] p-4 text-sm">
          <span className="flex-1">The artist catalogue couldn&rsquo;t load ({load.message}). You can still search all artists below.</span>
          <Button variant="secondary" onClick={() => { setLoad({ phase: "loading" }); setNonce((n) => n + 1); }} leadingIcon={<RotateCw aria-hidden className="size-4" />}>
            Retry
          </Button>
        </div>
      )}
      {load.phase === "ready" && shown.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong p-4 text-sm text-fg-secondary">
          No catalogue artists match &ldquo;{query}&rdquo;{category !== "all" ? ` in ${category === "indian" ? "Indian" : "International"}` : ""}. Try the full search below.
        </p>
      )}
      {load.phase === "ready" && shown.length > 0 && onAddMany && shown.some((e) => !isSelected(e.artist)) && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            loading={adding}
            leadingIcon={<Plus aria-hidden className="size-4" />}
            onClick={async () => {
              setAdding(true);
              try {
                await onAddMany(shown.filter((e) => !isSelected(e.artist)).map((e) => e.artist));
              } finally {
                setAdding(false);
              }
            }}
          >
            Add all {shown.filter((e) => !isSelected(e.artist)).length}
            {category === "all" && !query ? "" : category === "indian" ? " Indian" : category === "international" ? " international" : " shown"}
          </Button>
          <span className="text-xs text-fg-muted">You can remove any of them afterwards.</span>
        </div>
      )}
      {load.phase === "ready" && shown.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => {
            const selected = isSelected(e.artist);
            return (
              <li key={e.artist.id}>
                <div
                  className={cn(
                    "flex min-h-[4.25rem] items-center gap-3 rounded-xl border p-3 transition-colors",
                    selected ? "border-signal-ink/50 bg-signal/30" : "border-line bg-surface",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-10 shrink-0 place-items-center rounded-full text-xs font-bold",
                      selected ? "bg-ink text-signal" : "bg-surface-2 text-fg-secondary",
                    )}
                  >
                    {e.artist.name
                      .replace(/^the\s+/i, "")
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((w) => w[0])
                      .join("")
                      .toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{e.artist.name}</p>
                    <p className="text-xs text-fg-muted">{e.category === "indian" ? "Indian" : "International"}</p>
                  </div>
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${selected ? "Remove" : "Add"} ${e.artist.name}`}
                    onClick={() => onToggle(e.artist)}
                    className={cn(
                      "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold transition-colors",
                      selected ? "bg-ink text-on-ink hover:bg-ink/85" : "border border-line-strong bg-surface text-fg hover:border-fg",
                    )}
                  >
                    {selected ? <Check aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
                    {selected ? "Added" : "Add"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
