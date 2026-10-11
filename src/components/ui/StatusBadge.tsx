import {
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Clock3,
  Flame,
  HelpCircle,
  History,
  Loader2,
  Sparkles,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * Every status the UI can show, each with a fixed icon + label + colour.
 * Colour is never the only signal: the label and icon always render.
 */
export type StatusTone =
  | "confirmed"
  | "unconfirmed"
  | "stale"
  | "pending"
  | "unavailable"
  | "urgent"
  | "example"
  | "completed"
  | "in_progress"
  | "failed"
  | "unknown";

const toneMap: Record<StatusTone, { icon: LucideIcon; label: string; cls: string; spin?: boolean }> = {
  confirmed: { icon: CheckCircle2, label: "Confirmed", cls: "text-success border-success/40 bg-success/10" },
  completed: { icon: CheckCircle2, label: "Done", cls: "text-success border-success/40 bg-success/10" },
  unconfirmed: { icon: HelpCircle, label: "Unconfirmed", cls: "text-warning border-warning/40 bg-warning/10" },
  stale: { icon: History, label: "Stale", cls: "text-fg-secondary border-line-strong bg-surface-2" },
  pending: { icon: Clock3, label: "Pending", cls: "text-info border-info/40 bg-info/10" },
  in_progress: { icon: Loader2, label: "In progress", cls: "text-info border-info/40 bg-info/10", spin: true },
  unavailable: { icon: CircleSlash, label: "Not available", cls: "text-fg-secondary border-line bg-surface-2" },
  failed: { icon: XCircle, label: "Failed", cls: "text-urgent-ink border-urgent/40 bg-urgent/10" },
  urgent: { icon: Flame, label: "Act soon", cls: "text-urgent-ink border-urgent/45 bg-urgent/10" },
  example: { icon: Sparkles, label: "Example", cls: "text-fg border-fg-muted/60 bg-surface border-dashed" },
  unknown: { icon: CircleDashed, label: "Unknown", cls: "text-fg-secondary border-line bg-surface-2" },
};

export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  /** Override the default label; keep it short. */
  label?: string;
  className?: string;
}) {
  const t = toneMap[tone];
  const Icon = t.icon;
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs leading-none font-semibold",
        t.cls,
        className,
      )}
    >
      <Icon aria-hidden className={cn("size-3.5 shrink-0", t.spin && "animate-spin")} />
      <span className="truncate">{label ?? t.label}</span>
    </span>
  );
}
