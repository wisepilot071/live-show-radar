import type { ElementType, ReactNode } from "react";
import { cn } from "@/lib/cn";

const widths = {
  narrow: "max-w-2xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
} as const;

/** Responsive horizontal container. 16px gutters on phones, widening with the viewport. */
export function Container({
  as: Tag = "div",
  width = "default",
  className,
  children,
}: {
  as?: ElementType;
  width?: keyof typeof widths;
  className?: string;
  children: ReactNode;
}) {
  return <Tag className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", widths[width], className)}>{children}</Tag>;
}
