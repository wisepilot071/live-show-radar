"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Concert photograph behind the Discover hero.
 *
 * Image: "The audience goes crazy with the music on stage" by Adrià Sánchez
 * Roqué (Lleida, Spain), https://unsplash.com/photos/DMYmEtYRf3Y — Unsplash
 * License (free for commercial use, attribution not required; credited
 * anyway). Self-hosted in /public/media, never hotlinked. To swap the photo,
 * replace HERO_PHOTO below (keep a licence note with it).
 *
 * Readability: a forest-green/ink gradient sits over the photo, darkest
 * behind the text. If the image fails, the hero keeps its ink background.
 */
const HERO_PHOTO = {
  src: "/media/concert-crowd.jpg",
  width: 2400,
  height: 1596,
  credit: "Photo: Adrià Sánchez Roqué / Unsplash",
  creditUrl: "https://unsplash.com/photos/DMYmEtYRf3Y",
};

export function HeroBackdrop() {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      {!failed && (
        <Image
          src={HERO_PHOTO.src}
          alt=""
          fill
          priority
          sizes="(min-width: 1440px) 1360px, 100vw"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            "-z-20 object-cover object-[62%_58%] transition-opacity duration-700 ease-out sm:object-[50%_55%]",
            loaded ? "opacity-100" : "opacity-0",
          )}
        />
      )}
      {/* Forest-green tint, then an ink gradient that's darkest behind the text. */}
      <div aria-hidden className="absolute inset-0 -z-10 bg-[rgb(90_150_50/0.55)] mix-blend-color" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(32_40_32/0.4)_0%,rgb(32_40_32/0.65)_45%,rgb(32_40_32/0.94)_100%)] lg:bg-[linear-gradient(90deg,rgb(32_40_32/0.9)_0%,rgb(32_40_32/0.5)_40%,rgb(32_40_32/0)_75%)]"
      />
      {!failed && (
        <a
          href={HERO_PHOTO.creditUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-3 right-4 z-10 rounded-full bg-ink/60 px-2.5 py-1 text-[0.68rem] text-on-ink/85 hover:text-on-ink"
        >
          {HERO_PHOTO.credit}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </>
  );
}
