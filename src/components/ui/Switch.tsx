"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Labelled on/off control. A native checkbox with role="switch" so it is
 * keyboard (Space) and screen-reader operable; the whole row is the target.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  trailing,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: ReactNode;
  disabled?: boolean;
  trailing?: ReactNode;
}) {
  const id = useId();
  const descId = description ? `${id}-desc` : undefined;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors duration-[var(--duration-fast)]",
        checked ? "border-signal/45 bg-signal/[0.05]" : "border-line bg-surface hover:border-line-strong",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-describedby={descId}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden
        className={cn(
          "relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-[var(--duration-base)]",
          "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-signal",
          checked ? "border-signal bg-signal" : "border-line-strong bg-inset",
        )}
      >
        <span
          className={cn(
            "size-4 rounded-full transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-soft)]",
            checked ? "translate-x-[1.1rem] bg-on-signal" : "translate-x-[0.2rem] bg-fg-muted",
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-fg">{label}</span>
          <span className="font-mono text-[0.7rem] tracking-wide text-fg-muted uppercase">
            {checked ? "On" : "Off"}
          </span>
          {trailing}
        </span>
        {description ? (
          <span id={descId} className="mt-1 block text-sm text-fg-secondary">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
