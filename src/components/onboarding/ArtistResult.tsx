"use client";

import { Check, Plus } from "lucide-react";
import type { KeyboardEvent } from "react";
import type { Artist } from "@/domain/types";
import { cn } from "@/lib/cn";
import { ArtistAvatar } from "./ArtistAvatar";

/** Describes an artist enough to tell same-named acts apart. */
export function artistContext(artist: Artist): string {
  return [artist.disambiguation, artist.country, artist.genres?.slice(0, 2).join(", ")].filter(Boolean).join(" · ");
}

/** One search result: a toggle button. Selected state = icon + text + colour. */
export function ArtistResult({
  artist,
  selected,
  ambiguous,
  onToggle,
  onKeyDown,
  labels = { idle: "Add", active: "Added" },
}: {
  artist: Artist;
  selected: boolean;
  /** Another result shares this name — emphasise the context line. */
  ambiguous?: boolean;
  onToggle: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLButtonElement>) => void;
  labels?: { idle: string; active: string };
}) {
  const context = artistContext(artist);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      data-artist-result
      className={cn(
        "group flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-[border-color,background-color] duration-[var(--duration-fast)]",
        selected ? "border-signal-ink/60 bg-signal/30" : "border-line/70 bg-surface hover:border-line-strong hover:bg-surface-2",
      )}
    >
      <ArtistAvatar artist={artist} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-fg">{artist.name}</span>
        {context && (
          <span className={cn("block truncate text-sm", ambiguous ? "text-fg" : "text-fg-muted")}>{context}</span>
        )}
      </span>
      <span
        className={cn(
          "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-semibold transition-colors",
          selected
            ? "animate-pop border-signal-ink bg-signal text-on-signal"
            : "border-line-strong text-fg-secondary group-hover:border-fg-muted group-hover:text-fg",
        )}
      >
        {selected ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <Plus aria-hidden className="size-3.5" />}
        {selected ? labels.active : labels.idle}
      </span>
    </button>
  );
}
