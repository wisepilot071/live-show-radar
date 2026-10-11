"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { CrowdLights } from "@/components/media/CrowdLights";
import { DoodleArt, NightSky, type Doodle } from "@/components/media/NightSky";
import type { LiveEvent } from "@/domain/types";
import { cn } from "@/lib/cn";
import { photoCredit, photoForName } from "@/lib/artist-photo";
import { dateTile } from "./event-labels";

/** Stable small hash so each artist keeps the same art colours. */
function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
const WASHES = [
  "from-[#2a1f3d] via-[#1b2433] to-[#16201c]",
  "from-[#3a2320] via-[#22202a] to-[#16201c]",
  "from-[#1d3340] via-[#1a2530] to-[#16201c]",
  "from-[#2f3a1c] via-[#1f2a20] to-[#16201c]",
];

/**
 * Top of an event card.
 * - The headliner's real, licensed photo (matched to the catalogue) when we have one.
 *   This is the ARTIST, not an event poster, and it is credited.
 * - Otherwise original night-sky doodle art (never a stand-in photo).
 * The date stays visible as a chip on the image.
 */
export function EventMedia({ event, urgent, booked }: { event: LiveEvent; urgent?: boolean; booked?: boolean }) {
  const headliner = event.artistNames[0] ?? "";
  // Fictional example artists never get a real person's face, even if a name collides.
  const photo = event.origin === "illustrative" ? null : photoForName(headliner);
  const [failed, setFailed] = useState(false);
  const tile = dateTile(event);
  const doodle: Doodle = event.kind === "festival" ? "guitar" : event.kind === "tour_stop" ? "ticket" : "mic";
  const showPhoto = photo && !failed;

  return (
    <div className="on-ink relative isolate h-40 overflow-hidden bg-[#16201c] sm:h-44">
      {showPhoto ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- self-hosted 320px artist photo */}
          <img
            src={photo.src}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
            className="absolute inset-0 -z-10 size-full object-cover object-[50%_25%] transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:group-hover:scale-100"
          />
          <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[#16201c] via-[#16201c]/25 to-transparent" />
        </>
      ) : (
        <div aria-hidden className={cn("absolute inset-0 -z-10 bg-gradient-to-br", WASHES[hue(headliner) % WASHES.length])}>
          <NightSky />
          <CrowdLights className="h-1/2 opacity-80" />
          <DoodleArt doodle={doodle} className="absolute top-1/2 right-6 h-28 w-28 -translate-y-1/2 opacity-90" />
        </div>
      )}

      {/* Date chip — the date never disappears */}
      <div
        className={cn(
          "absolute top-3 left-3 flex items-center gap-2 rounded-2xl px-3 py-1.5 shadow-[0_8px_20px_-10px_rgb(0_0_0/0.6)]",
          urgent ? "bg-urgent text-ink" : "bg-canvas text-ink",
        )}
      >
        {tile ? (
          <>
            <span className="font-display text-2xl leading-none font-semibold">{tile.day}</span>
            <span className="flex flex-col text-[0.66rem] leading-tight font-bold tracking-[0.1em] uppercase">
              <span className={urgent ? "text-ink" : "text-signal-ink"}>{tile.month}</span>
              <span className="opacity-70">{tile.weekday}</span>
            </span>
          </>
        ) : (
          <span className="text-xs font-bold tracking-wide uppercase">Date TBA</span>
        )}
      </div>

      {booked && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-signal px-3 py-1.5 text-xs font-bold text-on-signal shadow-[0_8px_20px_-10px_rgb(0_0_0/0.6)]">
          <Check aria-hidden className="size-3.5" strokeWidth={3} /> Booked by you
        </span>
      )}

      {showPhoto && (
        <a
          href={photo.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={photoCredit(photo)}
          className="absolute right-2 bottom-2 max-w-[60%] truncate rounded-full bg-ink/55 px-2 py-0.5 text-[0.62rem] text-on-ink/80 hover:text-on-ink"
        >
          Photo: {photo.author} · {photo.licence}
          <span className="sr-only"> (artist photo credit, opens Wikimedia Commons in a new tab)</span>
        </a>
      )}
    </div>
  );
}
