"use client";

import { ChevronDown } from "lucide-react";
import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Native <select>: fully accessible, keyboard- and touch-friendly on every platform. */
export function SelectField({
  label,
  hint,
  className,
  children,
  ...select
}: {
  label: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"select">, "className">) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-fg">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          aria-describedby={hintId}
          className="min-h-13 w-full appearance-none rounded-lg border border-line-strong bg-surface px-4 pr-11 text-base text-fg transition-colors hover:border-fg-muted focus:border-signal-ink focus:outline-none"
          {...select}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-fg-muted"
        />
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
