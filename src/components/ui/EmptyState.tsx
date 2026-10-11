import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CrowdLights } from "@/components/media/CrowdLights";
import { DoodleArt, NightSky, type Doodle } from "@/components/media/NightSky";
import { cn } from "@/lib/cn";

/**
 * Empty / nothing-yet state.
 * - With `doodle`: a night-sky stage panel with twinkling stars and a chalk
 *   doodle that draws itself in — for whole-page empties (Saved, Alerts,
 *   Bookings, Artists, 404) so they don't feel blank.
 * - Without: the compact light version for small inline empties.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
  doodle,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  doodle?: Doodle;
}) {
  if (doodle) {
    return (
      <div
        className={cn(
          "on-ink relative isolate flex flex-col items-center gap-3 overflow-hidden rounded-[1.75rem] bg-[#16201c] px-6 pt-12 pb-24 text-center text-on-ink shadow-[0_30px_60px_-38px_rgb(32_40_32/0.75)] ring-1 ring-ink/10 sm:pt-14 sm:pb-28",
          className,
        )}
      >
        <NightSky dense />
        <CrowdLights className="h-20 sm:h-24" />
        <div className="animate-float">
          <DoodleArt doodle={doodle} className="h-28 w-28 sm:h-32 sm:w-32" />
        </div>
        <p className="flex items-center gap-2 font-display text-2xl font-semibold text-on-ink">
          <Icon aria-hidden className="size-5 text-signal" strokeWidth={1.75} />
          {title}
        </p>
        {children && <div className="max-w-md text-sm leading-relaxed text-on-ink/75">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-[radial-gradient(ellipse_at_top,rgb(200_241_105/0.12),transparent_60%)] px-6 py-10 text-center",
        className,
      )}
    >
      {/* Radar rings: the brand motif, static (no implied activity). */}
      <span aria-hidden className="relative grid size-20 place-items-center">
        <span className="absolute inset-0 rounded-full border border-line" />
        <span className="absolute inset-3 rounded-full border border-line-strong/70" />
        <span className="relative grid size-11 place-items-center rounded-full bg-surface shadow-card ring-1 ring-line">
          <Icon className="size-5 text-signal-ink" strokeWidth={1.75} />
        </span>
      </span>
      <p className="font-display text-lg font-semibold text-fg">{title}</p>
      {children && <div className="max-w-md text-sm text-fg-secondary">{children}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
