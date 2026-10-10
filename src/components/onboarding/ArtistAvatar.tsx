"use client";

import { useState } from "react";
import { initialsFor } from "@/domain/artist-identity";
import type { Artist } from "@/domain/types";
import { cn } from "@/lib/cn";

/**
 * Artist image with an initials fallback. Images only come from a real source
 * record; when absent or broken, the initials treatment is shown — we never
 * substitute an unrelated photo.
 */
export function ArtistAvatar({ artist, size = "md", className }: { artist: Artist; size?: "sm" | "md"; className?: string }) {
  const [failed, setFailed] = useState(false);
  const dims = size === "sm" ? "size-7 text-[0.62rem]" : "size-11 text-xs";
  const showImage = artist.imageUrl && !failed;
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-line bg-gradient-to-br from-surface-2 to-inset font-mono font-medium text-fg-secondary",
        dims,
        className,
      )}
    >
      {showImage ? (
        // Plain <img>: catalogue image hosts are arbitrary, and next/image would need each allow-listed.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={artist.imageUrl} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initialsFor(artist.name)
      )}
    </span>
  );
}
