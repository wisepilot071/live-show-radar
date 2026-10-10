"use client";

import { X } from "lucide-react";
import { artistIdentityKey } from "@/domain/artist-identity";
import type { ArtistSelection } from "@/domain/types";
import { cn } from "@/lib/cn";
import { ArtistAvatar } from "./ArtistAvatar";

/** Compact chips of selected artists with remove buttons. Newest first. */
export function SelectedArtistChips({
  selections,
  onRemove,
  className,
}: {
  selections: ArtistSelection[];
  onRemove: (identityKey: string) => void;
  className?: string;
}) {
  const ordered = [...selections].reverse();
  return (
    <ul className={cn("flex flex-wrap gap-2", className)} aria-label="Selected artists">
      {ordered.map((s) => {
        const key = artistIdentityKey(s.artist);
        return (
          <li
            key={key}
            className="inline-flex max-w-full animate-pop items-center gap-2 rounded-full border border-signal/40 bg-signal/[0.07] py-1 pr-1 pl-1"
          >
            <ArtistAvatar artist={s.artist} size="sm" />
            <span className="truncate text-sm font-medium text-fg">
              {s.artist.name}
              {s.artist.disambiguation && <span className="text-fg-muted"> ({s.artist.country})</span>}
            </span>
            <button
              type="button"
              onClick={() => onRemove(key)}
              aria-label={`Remove ${s.artist.name}`}
              className="grid size-10 shrink-0 place-items-center rounded-full text-fg-secondary hover:bg-urgent/15 hover:text-urgent"
            >
              <X aria-hidden className="size-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
