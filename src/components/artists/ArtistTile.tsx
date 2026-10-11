"use client";

import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { initialsFor } from "@/domain/artist-identity";
import type { ArtistSelection } from "@/domain/types";
import { cn } from "@/lib/cn";
import { photoCredit, photoForArtist } from "@/lib/artist-photo";

/**
 * One followed artist as a face card. The photo is the artist's own licensed
 * photo (matched by MusicBrainz id) or, when there is none, a colour initials
 * card — never someone else's picture. Click opens the details dialog.
 */
export function ArtistTile({
  id,
  selection,
  highlighted,
  onOpen,
  onRemove,
}: {
  id?: string;
  selection: ArtistSelection;
  highlighted?: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { artist } = selection;
  const photo = photoForArtist(artist);
  const src = artist.imageUrl ?? photo?.src;
  const [failed, setFailed] = useState(false);
  const linked = Boolean(artist.externalIds?.musicbrainz);
  const meta = [artist.category === "indian" ? "Indian" : artist.category === "international" ? "International" : null, artist.country]
    .filter(Boolean)
    .join(" · ");

  return (
    <li id={id} className="group relative">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${artist.name}: show details`}
        className={cn(
          "relative block aspect-[4/5] w-full overflow-hidden rounded-2xl bg-[#16201c] text-left shadow-card ring-2 transition-[transform,box-shadow] duration-[var(--duration-base)] ease-[var(--ease-out-soft)] hover:-translate-y-1 hover:shadow-card-hover motion-reduce:hover:translate-y-0",
          highlighted ? "ring-signal" : "ring-transparent hover:ring-signal/70",
        )}
      >
        {src && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element -- self-hosted square artist photo
          <img
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            title={photo && !artist.imageUrl ? photoCredit(photo) : undefined}
            onError={() => setFailed(true)}
            className="absolute inset-0 size-full object-cover object-[50%_25%] transition-transform duration-700 group-hover:scale-105 motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,rgb(255_138_112/0.55),transparent_55%),radial-gradient(circle_at_80%_90%,rgb(142_197_255/0.45),transparent_55%)] font-display text-4xl font-semibold text-on-ink"
          >
            {initialsFor(artist.name)}
          </span>
        )}
        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#16201c] via-[#16201c]/10 to-transparent" />
        <span className="absolute inset-x-0 bottom-0 space-y-0.5 p-3">
          <span className="block truncate font-display text-lg leading-tight font-semibold text-on-ink">{artist.name}</span>
          {meta && <span className="block truncate text-xs text-on-ink/70">{meta}</span>}
          {!linked && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-warning/90 px-2 py-0.5 text-[0.66rem] font-semibold text-canvas">
              <AlertTriangle aria-hidden className="size-3" /> Not linked
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${artist.name}`}
        title={`Remove ${artist.name}`}
        className="on-ink absolute top-2 right-2 grid size-9 place-items-center rounded-full bg-ink/70 text-on-ink opacity-100 backdrop-blur transition-[opacity,background-color] hover:bg-urgent hover:text-ink sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
      >
        <X aria-hidden className="size-4" />
      </button>
    </li>
  );
}
