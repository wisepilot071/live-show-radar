import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Small label used above headings. Uppercase is reserved for this one role. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold tracking-[0.12em] text-fg-secondary uppercase", className)}>
      {children}
    </p>
  );
}
