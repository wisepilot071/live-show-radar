"use client";

import { useState } from "react";
import { initialsFor } from "@/domain/artist-identity";
import type { Artist } from "@/domain/types";
import { cn } from "@/lib/cn";
import { photoCredit, photoForArtist } from "@/lib/artist-photo";

const SIZES = {
  sm: "size-7 text-[0.62rem]",
  md: "size-11 text-xs",
  lg: "size-16 text-base",
  xl: "size-24 text-xl",
} as const;

/**
 * Artist image with an initials fallback. Images only come from a real source
 * record (the source's own image, or the artist's licensed Wikimedia Commons
 * photo matched by MusicBrainz id); when absent or broken, the initials
 * treatment is shown — we never substitute an unrelated photo.
 */
export function ArtistAvatar({ artist, size = "md", className }: { artist: Artist; size?: keyof typeof SIZES; className?: string }) {
  const [failed, setFailed] = useState(false);
  const photo = photoForArtist(artist);
  const src = artist.imageUrl ?? photo?.src;
  const showImage = src && !failed;
  return (
    <span
      aria-hidden
      title={showImage && photo && !artist.imageUrl ? photoCredit(photo) : undefined}
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-gradient-to-br from-surface-2 to-inset font-mono font-medium text-fg-secondary",
        SIZES[size],
        className,
      )}
    >
      {showImage ? (
        // Plain <img>: catalogue image hosts are arbitrary, and next/image would need each allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initialsFor(artist.name)
      )}
    </span>
  );
}
