import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "info" | "success" | "warning" | "error";

const tones: Record<Tone, { icon: LucideIcon; cls: string; iconCls: string }> = {
  info: { icon: Info, cls: "border-line bg-inset", iconCls: "text-info" },
  success: { icon: CheckCircle2, cls: "border-success/35 bg-success/[0.06]", iconCls: "text-success" },
  warning: { icon: AlertTriangle, cls: "border-warning/35 bg-warning/[0.06]", iconCls: "text-warning" },
  error: { icon: XCircle, cls: "border-urgent/40 bg-urgent/[0.07]", iconCls: "text-urgent-ink" },
};

export function InlineAlert({
  tone = "info",
  title,
  children,
  action,
  className,
  live,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** Announce to assistive tech when content changes. */
  live?: boolean;
}) {
  const t = tones[tone];
  const Icon = t.icon;
  return (
    <div
      role={live ? (tone === "error" ? "alert" : "status") : undefined}
      className={cn("flex gap-3 rounded-md border p-4 text-sm", t.cls, className)}
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4.5 shrink-0", t.iconCls)} />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-semibold text-fg">{title}</p>}
        {children && <div className="text-fg-secondary [&_a]:text-fg [&_a]:underline">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}
