import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "surface" | "raised" | "inset" | "outline";

const tones: Record<Tone, string> = {
  surface: "bg-surface border border-line",
  raised: "bg-surface border border-line shadow-raised",
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
