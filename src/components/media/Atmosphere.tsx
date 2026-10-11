"use client";

import { useState } from "react";
import { ATMOSPHERE, type AtmosphereKey } from "@/data/visual-assets";
import { cn } from "@/lib/cn";

/**
 * Decorative concert photograph behind a dark "stage" panel. Always alt="" and
 * aria-hidden: it sets the mood, it never stands in for an event's own poster.
 * The parent must be `relative isolate overflow-hidden` with an ink background,
 * so if the photo fails or is slow, the panel still reads correctly.
 *
 * Overlays (in order): a brand-green colour wash that pulls every photo into the
 * same palette, then an ink gradient that is darkest where text sits.
 */
export function Atmosphere({
  asset,
  priority = false,
  fade = "left",
  strength = "strong",
  tone = "forest",
  className,
}: {
  asset: AtmosphereKey;
  priority?: boolean;
  /** Where the text is, so the gradient is darkest there. */
  fade?: "left" | "bottom";
  /** "strong" for headline panels, "soft" for bands with little text. */
  strength?: "strong" | "soft";
  /** "forest" = app green wash; "dusk" = the landing page's plum/violet wash. */
  tone?: "forest" | "dusk";
  className?: string;
}) {
  const a = ATMOSPHERE[asset];
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10", className)}
    >
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element -- pre-sized local WebP with srcset; avoids image-optimiser quota
        <img
          src={a.src}
          srcSet={a.small ? `${a.small} 800w, ${a.src} ${a.width}w` : undefined}
          sizes="(min-width: 1440px) 1360px, 100vw"
          alt=""
          width={a.width}
          height={a.height}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          style={{ objectPosition: a.focal }}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-700 ease-out",
            loaded ? "opacity-100" : "opacity-0",
          )}
          ref={(el) => {
            // Cached images can finish before React attaches onLoad.
            if (el?.complete && el.naturalWidth > 0) setLoaded(true);
          }}
        />
      )}
      <div
        className={cn(
          "absolute inset-0 mix-blend-color",
          tone === "dusk"
            ? "bg-[rgb(120_70_170/0.35)]"
            : strength === "strong"
              ? "bg-[rgb(90_150_50/0.5)]"
              : "bg-[rgb(90_150_50/0.35)]",
        )}
      />
      {tone === "dusk" ? (
        <div
          className={cn(
            "absolute inset-0",
            fade === "left"
              ? "bg-[linear-gradient(180deg,rgb(20_15_28/0.55)_0%,rgb(20_15_28/0.7)_55%,rgb(20_15_28/0.97)_100%)] lg:bg-[linear-gradient(90deg,rgb(20_15_28/0.95)_0%,rgb(20_15_28/0.72)_42%,rgb(20_15_28/0.35)_75%,rgb(20_15_28/0.6)_100%)]"
              : "bg-[linear-gradient(180deg,rgb(20_15_28/0.5)_0%,rgb(20_15_28/0.75)_55%,rgb(20_15_28/0.98)_100%)]",
          )}
        />
      ) : (
        <div
          className={cn(
            "absolute inset-0",
            fade === "left" &&
              strength === "strong" &&
              "bg-[linear-gradient(180deg,rgb(32_40_32/0.5)_0%,rgb(32_40_32/0.72)_50%,rgb(32_40_32/0.95)_100%)] md:bg-[linear-gradient(90deg,rgb(32_40_32/0.94)_0%,rgb(32_40_32/0.7)_45%,rgb(32_40_32/0.15)_100%)]",
            fade === "left" &&
              strength === "soft" &&
              "bg-[linear-gradient(90deg,rgb(32_40_32/0.88)_0%,rgb(32_40_32/0.55)_50%,rgb(32_40_32/0.2)_100%)]",
            fade === "bottom" &&
              "bg-[linear-gradient(180deg,rgb(32_40_32/0.25)_0%,rgb(32_40_32/0.6)_55%,rgb(32_40_32/0.96)_100%)]",
          )}
        />
      )}
      {/* Subtle top highlight: gives the panel a lit, layered edge. */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-on-ink/25 to-transparent" />
    </div>
  );
}
