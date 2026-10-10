"use client";

import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type TextFieldProps = {
  label: string;
  hint?: ReactNode;
  error?: string;
  leadingIcon?: ReactNode;
  trailing?: ReactNode;
  hideLabel?: boolean;
  className?: string;
} & Omit<ComponentPropsWithoutRef<"input">, "className">;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, leadingIcon, trailing, hideLabel, className, ...input },
  ref,
) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className={cn("block text-sm font-semibold text-fg", hideLabel && "sr-only")}>
        {label}
      </label>
      <div
        className={cn(
          "flex min-h-13 items-center gap-3 rounded-lg border bg-inset px-4 transition-colors duration-[var(--duration-fast)]",
          "focus-within:border-signal focus-within:bg-surface",
          error ? "border-urgent" : "border-line-strong hover:border-fg-muted",
        )}
      >
        {leadingIcon && (
          <span className="shrink-0 text-fg-muted" aria-hidden>
            {leadingIcon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          className="min-w-0 flex-1 bg-transparent py-3 text-base text-fg placeholder:text-fg-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          {...input}
        />
        {trailing}
      </div>
      {hint && !error ? (
        <p id={hintId} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-urgent">
          {error}
        </p>
      ) : null}
    </div>
  );
});
