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
        "flex flex-col items-center gap-3 rounded-lg border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-12 place-items-center rounded-full border border-line bg-inset">
        <Icon aria-hidden className="size-5 text-fg-secondary" />
      </span>
      <p className="font-display text-lg font-semibold text-fg">{title}</p>
      {children && <div className="max-w-md text-sm text-fg-secondary">{children}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
