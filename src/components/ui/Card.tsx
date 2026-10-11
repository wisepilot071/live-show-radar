import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "surface" | "raised" | "layered" | "inset" | "outline";

const tones: Record<Tone, string> = {
  surface: "bg-surface border border-line",
  raised: "bg-surface border border-line shadow-raised",
  /** Primary content panels: contact + ambient shadow and a lit top edge. */
  layered: "bg-surface border border-line shadow-card [box-shadow:inset_0_1px_0_rgb(255_255_255/0.9),var(--shadow-card)]",
  inset: "bg-inset border border-line",
  outline: "border border-dashed border-line-strong",
};

export function Card({
  as: Tag = "div",
  tone = "surface",
  className,
  children,
  ...rest
}: { as?: ElementType; tone?: Tone; className?: string; children: ReactNode } & ComponentPropsWithoutRef<"div">) {
  return (
    <Tag className={cn("rounded-lg", tones[tone], className)} {...rest}>
      {children}
    </Tag>
  );
}
