import Link from "next/link";
import { cn } from "@/lib/cn";

const motion = "transition-[opacity,transform] duration-[var(--duration-slow)] ease-[var(--ease-out-soft)]";

/**
 * Ticket-ping glyph: a ticket stub (live shows) carrying a radar ping (alerts).
 * The perforation splits the stub; the coral dot is the "new signal".
 * Hover (via a parent `group`) brightens the lower arc and nudges the blip.
 */
export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="4 10 40 28" width="40" height="28" aria-hidden className={cn("h-7 w-10", className)} fill="none">
      {/* Ink ticket so the lime ping reads on the light canvas. */}
      <path
        d="M5 12 H43 V20 A4 4 0 0 0 43 28 V36 H5 V28 A4 4 0 0 0 5 20 Z"
        fill="var(--background-ink)"
        strokeLinejoin="round"
      />
      <path d="M31 14.5 V33.5" stroke="var(--text-on-ink)" strokeOpacity=".45" strokeDasharray="2 2.5" />
      <circle cx="18" cy="24" r="3" fill="var(--accent-primary)" />
      <path d="M12.5 18.5 A7.8 7.8 0 0 1 23.5 18.5" stroke="var(--accent-primary)" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M12.5 29.5 A7.8 7.8 0 0 0 23.5 29.5"
        stroke="var(--accent-primary)"
        strokeWidth="2.2"
        strokeLinecap="round"
        className={cn("opacity-45 group-hover:opacity-100", motion)}
      />
      <circle
        cx="37"
        cy="24"
        r="2.2"
        fill="var(--status-urgent)"
        className={cn("origin-center [transform-box:fill-box] group-hover:scale-125", motion)}
      />
    </svg>
  );
}

/** Logo lockup. Always links home. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label="Live Show Radar — home"
      className={cn("group inline-flex min-h-11 items-center gap-2.5 text-fg", className)}
    >
      <BrandGlyph className={cn("-rotate-6 group-hover:rotate-0", motion)} />
      <span className="font-display text-[1.05rem] leading-none font-extrabold tracking-tight">
        Live Show <span className="text-signal-ink">Radar</span>
      </span>
    </Link>
  );
}
