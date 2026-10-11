import type { ReactNode } from "react";
import { Atmosphere } from "@/components/media/Atmosphere";
import { Eyebrow } from "@/components/ui/Eyebrow";
import type { AtmosphereKey } from "@/data/visual-assets";
import { cn } from "@/lib/cn";

/**
 * Editorial header shared by every app page.
 * With `atmosphere`, the same eyebrow/title/description sit on a dark "stage"
 * panel over a decorative concert photo (text and actions unchanged).
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  atmosphere,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  atmosphere?: AtmosphereKey;
}) {
  const staged = Boolean(atmosphere);
  return (
    <header
      className={cn(
        "flex flex-col gap-5 md:flex-row md:items-end md:justify-between",
        staged &&
          "on-ink relative isolate animate-rise overflow-hidden rounded-[1.75rem] bg-ink px-5 pt-14 pb-7 text-on-ink shadow-[0_30px_60px_-35px_rgb(32_40_32/0.6)] ring-1 ring-ink/10 sm:px-8 sm:pt-20 sm:pb-9 lg:px-10",
      )}
    >
      {atmosphere && <Atmosphere asset={atmosphere} priority />}
      <div className="min-w-0 space-y-3">
        <Eyebrow className={staged ? "flex items-center gap-2 text-signal" : undefined}>
          {staged && <span aria-hidden className="inline-block h-px w-6 bg-signal" />}
          {eyebrow}
        </Eyebrow>
        <h1
          className={cn(
            "font-display text-[clamp(2.1rem,5vw,3.6rem)] leading-[0.98] font-extrabold tracking-tight text-balance",
            staged && "max-w-3xl text-on-ink drop-shadow-[0_2px_18px_rgb(0_0_0/0.35)]",
          )}
        >
          {title}
        </h1>
        {description && (
          <div className={cn("max-w-2xl text-lg leading-relaxed", staged ? "text-on-ink/85" : "text-fg-secondary")}>{description}</div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
