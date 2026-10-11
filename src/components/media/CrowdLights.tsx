"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";

/*
 * A sea of crowd lights along the bottom of a dark panel — LED wristbands in
 * bands of colour with a brightness wave travelling across the "stadium",
 * mixed with white phone-torch sparkles (inspired by stadium-show light
 * moments; original SVG). Decorative only (aria-hidden); positions are
 * deterministic so server and client render the same.
 * Performance: colours are fixed and only opacity animates (no per-frame
 * recolouring), and the whole layer pauses while it is off screen.
 * Reduced motion: the global rule freezes it.
 */

interface Light {
  x: number;
  y: number;
  r: number;
  torch: boolean;
  delay: number;
  fill: string;
}

/** Wristband colours, banded across the stadium. */
const WAVE = ["#8ec5ff", "#b48cff", "#ff7fc8", "#c8f169", "#ffc65c"];

function buildLights(): Light[] {
  const lights: Light[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Rows from the back (small, dense, faint) to the front (bigger).
  const rows = [
    { y: 14, n: 64, r: 0.6 },
    { y: 20, n: 52, r: 0.8 },
    { y: 27, n: 40, r: 0.95 },
    { y: 35, n: 30, r: 1.1 },
  ];
  rows.forEach((row, ri) => {
    for (let i = 0; i < row.n; i++) {
      const x = (i + 0.2 + rand() * 0.6) * (100 / row.n);
      lights.push({
        x,
        y: row.y + (rand() - 0.5) * 3,
        r: row.r * (0.8 + rand() * 0.5),
        torch: rand() < 0.16,
        // The wave moves left → right; back rows lag slightly.
        delay: -(x / 100) * 4 - ri * 0.25,
        fill: WAVE[Math.floor((x / 100) * WAVE.length * 2 + ri) % WAVE.length]!,
      });
    }
  });
  return lights;
}

const LIGHTS = buildLights();

export function CrowdLights({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Toggle a data attribute directly (no re-render): CSS pauses the circles off screen.
    const io = new IntersectionObserver(([e]) => {
      el.dataset.playing = e?.isIntersecting ? "true" : "false";
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      aria-hidden
      data-playing="false"
      className={cn("crowd-lights pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[45%]", className)}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[rgb(180_140_255/0.18)]" />
      <svg viewBox="0 0 100 40" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 size-full">
        {LIGHTS.map((l, i) => (
          <circle
            key={i}
            cx={l.x}
            cy={l.y}
            r={l.torch ? l.r * 0.32 : l.r * 0.26}
            fill={l.torch ? "#fffbe8" : l.fill}
            className="animate-wave"
            style={{ animationDelay: `${l.torch ? l.delay * 1.7 : l.delay}s`, animationDuration: l.torch ? "2.6s" : undefined }}
          />
        ))}
      </svg>
    </div>
  );
}
