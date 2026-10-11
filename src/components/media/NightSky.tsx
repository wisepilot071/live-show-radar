import { cn } from "@/lib/cn";

/*
 * Original illustration for empty and quiet states: a night sky with
 * hand-drawn twinkling stars and a chalk doodle that draws itself in
 * (inspired by crayon-on-night lyric-video styles; all artwork is our own SVG).
 * Purely decorative (aria-hidden). It never implies that something is
 * happening — no sweeps, spinners or progress. Under reduced motion the
 * global rule stops the animations and the finished drawing is shown.
 */

export type Doodle = "mic" | "ticket" | "bell" | "bookmark" | "guitar" | "calendar" | "compass";

const CRAYON = {
  coral: "#ff8a70",
  sky: "#8ec5ff",
  sun: "#f5d76e",
  lime: "#c8f169",
  chalk: "#f7f4ec",
};

/** Deterministic star field (no Math.random → identical on server and client). */
const STARS: Array<{ x: number; y: number; s: number; c: keyof typeof CRAYON; d: number }> = [
  { x: 6, y: 14, s: 1, c: "sun", d: 0 },
  { x: 18, y: 72, s: 0.7, c: "chalk", d: 1.2 },
  { x: 27, y: 28, s: 0.8, c: "sky", d: 2.1 },
  { x: 40, y: 8, s: 0.6, c: "sun", d: 0.6 },
  { x: 62, y: 18, s: 0.9, c: "coral", d: 1.7 },
  { x: 74, y: 70, s: 0.7, c: "sun", d: 0.3 },
  { x: 86, y: 24, s: 1.1, c: "sun", d: 2.6 },
  { x: 93, y: 58, s: 0.6, c: "chalk", d: 1.1 },
  { x: 52, y: 86, s: 0.6, c: "sky", d: 2.3 },
  { x: 10, y: 44, s: 0.5, c: "chalk", d: 0.9 },
  { x: 80, y: 88, s: 0.5, c: "coral", d: 1.9 },
  { x: 34, y: 90, s: 0.55, c: "sun", d: 2.8 },
];

/** A wobbly four-point star, like the ones drawn with a crayon. */
function Star({ x, y, s, c, d }: (typeof STARS)[number]) {
  return (
    <svg
      viewBox="-10 -10 20 20"
      className="absolute origin-center animate-twinkle"
      style={{ left: `${x}%`, top: `${y}%`, width: `${16 * s}px`, height: `${16 * s}px`, animationDelay: `${d}s` }}
    >
      <path d="M0 -8 C1 -2 2 -1 8 0 C2 1 1 2 0 8 C-1 2 -2 1 -8 0 C-2 -1 -1 -2 0 -8Z" fill={CRAYON[c]} />
    </svg>
  );
}

/** Chalk doodles: single-stroke paths, drawn in with stroke-dashoffset (pathLength=1). */
const DOODLES: Record<Doodle, Array<{ d: string; c: keyof typeof CRAYON }>> = {
  mic: [
    { d: "M50 18 C62 18 66 26 66 36 L66 56 C66 66 60 72 50 72 C40 72 34 66 34 56 L34 36 C34 26 38 18 50 18Z", c: "chalk" },
    { d: "M36 40 L64 40 M36 48 L64 48 M36 56 L64 56", c: "sky" },
    { d: "M26 54 C26 74 38 84 50 84 C62 84 74 74 74 54", c: "chalk" },
    { d: "M50 84 L50 100 M36 102 L64 102", c: "sun" },
    { d: "M82 22 C88 26 90 32 88 38 M18 26 C12 32 12 38 14 44", c: "coral" },
  ],
  ticket: [
    { d: "M14 34 L86 34 L86 48 C80 48 78 52 78 56 C78 60 80 64 86 64 L86 78 L14 78 L14 64 C20 64 22 60 22 56 C22 52 20 48 14 48Z", c: "chalk" },
    { d: "M62 36 L62 42 M62 48 L62 54 M62 60 L62 66 M62 72 L62 76", c: "sun" },
    { d: "M26 48 L52 48 M26 58 L48 58 M26 68 L42 68", c: "sky" },
    { d: "M72 18 L76 26 L84 22 M20 92 C30 88 40 94 48 90", c: "coral" },
  ],
  bell: [
    { d: "M50 16 C50 16 50 22 50 22 M28 72 C30 66 32 60 32 46 C32 32 40 24 50 24 C60 24 68 32 68 46 C68 60 70 66 72 72 Z", c: "chalk" },
    { d: "M24 74 L76 74", c: "sun" },
    { d: "M42 80 C44 88 56 88 58 80", c: "chalk" },
    { d: "M16 38 C12 46 12 54 16 62 M84 38 C88 46 88 54 84 62", c: "coral" },
    { d: "M22 30 C18 36 18 42 20 48 M78 30 C82 36 82 42 80 48", c: "sky" },
  ],
  bookmark: [
    { d: "M30 16 L70 16 L70 90 L50 74 L30 90 Z", c: "chalk" },
    { d: "M50 32 L54 42 L64 43 L56 50 L59 60 L50 54 L41 60 L44 50 L36 43 L46 42 Z", c: "sun" },
    { d: "M80 24 C86 30 86 38 82 44 M18 70 C14 76 16 82 22 86", c: "sky" },
  ],
  guitar: [
    { d: "M40 54 C30 50 20 56 20 68 C20 80 32 88 44 84 C52 82 56 76 60 72 C64 68 70 66 70 58 C70 50 62 46 56 50 C52 52 48 56 40 54Z", c: "chalk" },
    { d: "M44 68 C44 72 48 74 50 70 C52 66 48 64 44 68Z", c: "sun" },
    { d: "M54 60 L84 22 M80 18 L90 24", c: "chalk" },
    { d: "M36 62 L50 76", c: "coral" },
    { d: "M14 30 C20 26 26 30 24 36 M78 80 C82 86 88 86 92 82", c: "sky" },
  ],
  calendar: [
    { d: "M18 26 L82 26 L82 86 L18 86 Z M18 42 L82 42", c: "chalk" },
    { d: "M34 18 L34 32 M66 18 L66 32", c: "sun" },
    { d: "M56 66 C56 58 62 54 66 54 C72 54 76 58 76 64 C76 70 72 74 66 74 C60 74 56 70 56 66 Z M74 72 L84 82", c: "sky" },
    { d: "M28 54 L40 54 M28 64 L40 64 M28 74 L40 74", c: "coral" },
  ],
  compass: [
    { d: "M50 14 C70 14 86 30 86 50 C86 70 70 86 50 86 C30 86 14 70 14 50 C14 30 30 14 50 14 Z", c: "chalk" },
    { d: "M50 28 L58 50 L50 72 L42 50 Z", c: "coral" },
    { d: "M50 50 L58 50", c: "sun" },
    { d: "M50 6 L50 12 M50 88 L50 94 M6 50 L12 50 M88 50 L94 50", c: "sky" },
  ],
};

export function DoodleArt({ doodle, className }: { doodle: Doodle; className?: string }) {
  return (
    <svg viewBox="0 0 100 110" fill="none" className={cn("overflow-visible", className)} aria-hidden>
      {DOODLES[doodle].map((p, i) => (
        <path
          key={i}
          d={p.d}
          pathLength={1}
          stroke={CRAYON[p.c]}
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-draw [stroke-dasharray:1] [stroke-dashoffset:0]"
          style={{ animationDelay: `${0.15 + i * 0.35}s` }}
        />
      ))}
    </svg>
  );
}

/** Star field layer; place inside a `relative overflow-hidden` dark panel. */
export function NightSky({ className, dense = false }: { className?: string; dense?: boolean }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgb(142_197_255/0.16),transparent_55%),radial-gradient(ellipse_at_85%_100%,rgb(255_138_112/0.14),transparent_55%),radial-gradient(ellipse_at_50%_50%,rgb(200_241_105/0.06),transparent_70%)]" />
      {(dense ? STARS : STARS.slice(0, 8)).map((s, i) => (
        <Star key={i} {...s} />
      ))}
    </div>
  );
}
