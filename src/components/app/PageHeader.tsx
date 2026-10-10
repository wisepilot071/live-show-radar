import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";

/** Editorial header shared by every app page. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0 space-y-3">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="font-display text-[clamp(2.1rem,5vw,3.6rem)] leading-[0.98] font-extrabold tracking-tight text-balance">
          {title}
        </h1>
        {description && <div className="max-w-2xl text-lg leading-relaxed text-fg-secondary">{description}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}
