"use client";

import { usePathname } from "next/navigation";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { STEPS, stepSequence } from "@/features/onboarding/steps";
import { cn } from "@/lib/cn";

/**
 * Segmented progress bar for the steps in the user's current path.
 * Not a percentage: it just shows position in the sequence.
 */
export function OnboardingProgress() {
  const pathname = usePathname();
  const { state, hydrated } = useOnboarding();
  const seq = stepSequence(state.method);
  const currentIndex = seq.findIndex((id) => STEPS[id].path === pathname);
  const current = currentIndex >= 0 ? seq[currentIndex] : undefined;

  if (!hydrated || !current) return <div className="h-[1.375rem]" aria-hidden />;

  return (
    <nav aria-label="Setup progress" className="flex items-center gap-3">
      <p className="shrink-0 font-mono text-[0.7rem] tracking-wide text-fg-secondary uppercase">
        Step {currentIndex + 1}/{seq.length}
        <span className="text-fg-muted"> · {STEPS[current].label}</span>
      </p>
      <ol className="flex flex-1 gap-1">
        {seq.map((id, i) => (
          <li
            key={id}
            aria-current={i === currentIndex ? "step" : undefined}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors duration-[var(--duration-slow)]",
              i < currentIndex ? "bg-signal/70" : i === currentIndex ? "bg-signal" : "bg-line",
            )}
          >
            <span className="sr-only">
              {STEPS[id].label}
              {i < currentIndex ? " (done)" : i === currentIndex ? " (current)" : ""}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
