import { cn } from "@/lib/cn";

/** Indeterminate loader. Never shows a percentage — we do not invent progress. */
export function LoadingIndicator({ label, className }: { label: string; className?: string }) {
  return (
    <div role="status" className={cn("flex items-center gap-3 text-sm text-fg-secondary", className)}>
      <span aria-hidden className="relative grid size-5 place-items-center">
        <span className="absolute inset-0 rounded-full border border-signal-ink/40 animate-ping-soft" />
        <span className="size-2 rounded-full bg-signal" />
      </span>
      <span>{label}</span>
    </div>
  );
}
