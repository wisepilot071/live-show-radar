import { cn } from "@/lib/cn";

/*
 * A sea of crowd lights along the bottom of a dark panel — LED wristbands that
 * pulse colour in a wave travelling across the "stadium", mixed with white
 * phone-torch sparkles (inspired by stadium-show light moments; original SVG).
 * Decorative only (aria-hidden); positions are deterministic so server and
 * client render the same. Reduced motion: the global rule freezes it.
 */

interface Light {
  x: number;
  y: number;
  r: number;
  torch: boolean;
  delay: number;
}

function buildLights(): Light[] {
  const lights: Light[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  // Rows from the back (small, dense, faint) to the front (bigger).
  const rows = [
    { y: 14, n: 110, r: 0.55 },
    { y: 20, n: 90, r: 0.75 },
    { y: 27, n: 70, r: 1 },
    { y: 35, n: 52, r: 1.3 },
  ];
  rows.forEach((row, ri) => {
    for (let i = 0; i < row.n; i++) {
      const x = (i + 0.2 + rand() * 0.6) * (100 / row.n);
      lights.push({
        x,
        y: row.y + (rand() - 0.5) * 3,
        r: row.r * (0.8 + rand() * 0.5),
        torch: rand() < 0.16,
        // The colour wave moves left → right; back rows lag slightly.
        delay: -(x / 100) * 4 - ri * 0.25,
      });
    }
  });
  return lights;
}

const LIGHTS = buildLights();

export function CrowdLights({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[45%]",
        className,
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[rgb(180_140_255/0.18)]" />
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-0 size-full"
      >
        {LIGHTS.map((l, i) =>
          l.torch ? (
            <circle
              key={i}
              cx={l.x}
              cy={l.y}
              r={l.r * 0.32}
              fill="#fffbe8"
              className="origin-center animate-twinkle [transform-box:fill-box]"
              style={{ animationDelay: `${l.delay * 0.7}s` }}
            />
          ) : (
            <circle
              key={i}
              cx={l.x}
              cy={l.y}
              r={l.r * 0.24}
              className="animate-xyloband"
              style={{ animationDelay: `${l.delay}s` }}
            />
          ),
        )}
      </svg>
    </div>
  );
}
