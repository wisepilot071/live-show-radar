"use client";

import { usePathname } from "next/navigation";

/*
 * Soft colour glows behind every app tab so pages never feel flat. Each tab has
 * its own accent pair; the blobs drift very slowly (static under reduced motion).
 * Decorative only: fixed, behind content, ignores pointer events.
 */
const TINTS: Array<{ match: string; a: string; b: string }> = [
  { match: "/radar", a: "rgb(200 241 105 / 0.30)", b: "rgb(142 197 255 / 0.22)" },
  { match: "/artists", a: "rgb(255 138 112 / 0.24)", b: "rgb(245 215 110 / 0.26)" },
  { match: "/inbox", a: "rgb(142 197 255 / 0.30)", b: "rgb(200 241 105 / 0.20)" },
  { match: "/saved", a: "rgb(245 215 110 / 0.30)", b: "rgb(255 138 112 / 0.18)" },
  { match: "/bookings", a: "rgb(255 138 112 / 0.24)", b: "rgb(142 197 255 / 0.22)" },
  { match: "/settings", a: "rgb(200 241 105 / 0.22)", b: "rgb(245 215 110 / 0.20)" },
];

export function AmbientBackdrop() {
  const pathname = usePathname();
  const tint = TINTS.find((t) => pathname === t.match || pathname.startsWith(`${t.match}/`)) ?? TINTS[0]!;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute -top-[20%] -left-[15%] h-[70vh] w-[70vw] animate-drift rounded-full will-change-transform blur-3xl transition-[background] duration-1000"
        style={{ background: `radial-gradient(closest-side, ${tint.a}, transparent)` }}
      />
      <div
        className="absolute -right-[20%] -bottom-[25%] h-[75vh] w-[65vw] animate-drift rounded-full will-change-transform blur-3xl transition-[background] duration-1000 [animation-delay:-13s]"
        style={{ background: `radial-gradient(closest-side, ${tint.b}, transparent)` }}
      />
    </div>
  );
}
