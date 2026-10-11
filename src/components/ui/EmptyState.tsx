import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
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
