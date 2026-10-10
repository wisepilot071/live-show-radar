import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Small mono uppercase label used above headings and for metadata. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-xs font-medium tracking-[0.14em] text-fg-secondary uppercase", className)}>
      {children}
    </p>
  );
}
