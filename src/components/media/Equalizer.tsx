import { cn } from "@/lib/cn";

/**
 * Three-bar equaliser. Animates ONLY when `active` (callers pass true only while
 * YouTube reports PLAYING); otherwise it rests as short static bars. Reduced
 * motion: the global rule stops the animation, leaving static bars.
 */
export function Equalizer({ active, className }: { active: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex h-3.5 items-end gap-[2px]", className)}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn("w-[3px] origin-bottom rounded-full bg-signal", active ? "h-full animate-eq" : "h-1/3")}
          style={active ? { animationDelay: `${i * -0.28}s` } : undefined}
        />
      ))}
    </span>
  );
}
