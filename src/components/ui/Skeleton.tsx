import { cn } from "@/lib/cn";

/**
 * Content-shaped placeholder. Size it like the thing it stands in for, so the
 * layout doesn't jump when real content arrives. Decorative: pair it with a
 * role="status" label on the container.
 */
export function Skeleton({ className, tone = "light" }: { className?: string; tone?: "light" | "ink" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block overflow-hidden rounded-md",
        tone === "light" ? "bg-surface-2/80" : "bg-on-ink/[0.08]",
        "relative after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer",
        tone === "light"
          ? "after:bg-gradient-to-r after:from-transparent after:via-surface/70 after:to-transparent"
          : "after:bg-gradient-to-r after:from-transparent after:via-on-ink/[0.08] after:to-transparent",
        className,
      )}
    />
  );
}
