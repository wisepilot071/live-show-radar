import { cn } from "@/lib/cn";

/**
 * Decorative radar: range rings, a slow sweep and city markers.
 * Markers are cities the product covers — not events. Bengaluru is the
 * brightest (priority), others stay visible (included, not excluded).
 * The sweep stops under prefers-reduced-motion.
 */
const MARKERS = [
  { city: "Bengaluru", x: 52, y: 62, priority: true },
  { city: "Mumbai", x: 30, y: 44 },
  { city: "Delhi", x: 46, y: 18 },
  { city: "Chennai", x: 68, y: 70 },
  { city: "Goa", x: 33, y: 58 },
  { city: "Shillong", x: 82, y: 30 },
] as const;

export function RadarVisual({ className }: { className?: string }) {
  return (
    <figure className={cn("relative aspect-square w-full", className)}>
      <div aria-hidden className="on-ink absolute inset-0 overflow-hidden rounded-full border-8 border-surface bg-ink shadow-raised">
        {/* Rings */}
        {[0.25, 0.5, 0.75].map((r) => (
          <div
            key={r}
            className="absolute rounded-full border border-on-ink/15"
            style={{ inset: `${(r * 100) / 2}%` }}
          />
        ))}
        {/* Crosshair */}
        <div className="absolute inset-y-0 left-1/2 w-px bg-on-ink/10" />
        <div className="absolute inset-x-0 top-1/2 h-px bg-on-ink/10" />
        {/* Sweep */}
        <div
          className="motion-sweep absolute inset-0 animate-sweep rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, rgb(200 241 105 / 0.34) 0deg, rgb(200 241 105 / 0.07) 50deg, transparent 80deg)",
          }}
        />
        {/* City markers */}
        {MARKERS.map((m) => (
          <div
            key={m.city}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${m.x}%`, top: `${m.y}%` }}
          >
            <span className="relative flex items-center gap-2">
              <span className="relative grid size-3 place-items-center">
                {"priority" in m && (
                  <span className="absolute inset-0 rounded-full bg-signal/50 animate-ping-soft" />
                )}
                <span
                  className={cn(
                    "size-2.5 rounded-full",
                    "priority" in m ? "bg-signal shadow-[0_0_14px_rgb(200_241_105/0.7)]" : "bg-on-ink/60",
                  )}
                />
              </span>
              <span
                className={cn(
                  "text-[0.68rem] font-medium tracking-wide whitespace-nowrap uppercase sm:text-[0.72rem]",
                  "priority" in m ? "font-semibold text-signal" : "text-on-ink/75",
                )}
              >
                {m.city}
              </span>
            </span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">
        Decorative radar showing Bengaluru as the priority city, with other Indian cities still in range.
      </figcaption>
    </figure>
  );
}
