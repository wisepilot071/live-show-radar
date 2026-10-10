"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";

/**
 * Standard frame for a step: heading block, body, sticky footer nav.
 * Waits for the stored draft before rendering the body so the user never
 * sees defaults flash over their saved choices.
 */
export function StepLayout({
  eyebrow,
  title,
  description,
  children,
  footer,
  width = "default",
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "narrow" | "default";
}) {
  const { hydrated } = useOnboarding();
  return (
    <div className="flex min-h-full flex-col">
      <Container width={width} className="flex-1 space-y-8 pt-10 pb-12 sm:pt-14">
        {hydrated ? (
          <>
            {/* Titles can depend on saved state, so they wait for hydration too. */}
            <header className="animate-rise space-y-4">
              <Eyebrow>{eyebrow}</Eyebrow>
              <h1 className="font-display text-[clamp(2.1rem,5.5vw,3.5rem)] leading-[1] font-extrabold tracking-tight text-balance">
                {title}
              </h1>
              {description && <div className="max-w-2xl text-lg leading-relaxed text-fg-secondary">{description}</div>}
            </header>
            <div className="animate-rise [animation-delay:60ms]">{children}</div>
          </>
        ) : (
          <LoadingIndicator label="Loading your saved choices…" className="min-h-40" />
        )}
      </Container>
      {footer && hydrated && (
        <div className="sticky bottom-0 z-30 border-t border-line/70 bg-canvas/92 backdrop-blur-md">
          <Container width={width} className="flex min-h-18 items-center justify-between gap-3 py-3">
            {footer}
          </Container>
        </div>
      )}
    </div>
  );
}

/** Back + forward controls. Forward is either a link or an action (for steps that commit state). */
export function StepNav({
  backHref,
  backLabel = "Back",
  next,
  aside,
}: {
  backHref?: string;
  backLabel?: string;
  next?:
    | { kind: "link"; href: string; label: string }
    | { kind: "action"; onClick: () => void; label: string; disabled?: boolean; loading?: boolean };
  aside?: ReactNode;
}) {
  const icon = <ArrowRight aria-hidden className="size-4" />;
  return (
    <>
      {backHref ? (
        <ButtonLink href={backHref} variant="ghost" leadingIcon={<ArrowLeft aria-hidden className="size-4" />}>
          {backLabel}
        </ButtonLink>
      ) : (
        <span />
      )}
      <div className="flex min-w-0 items-center gap-3">
        {aside && <div className="hidden min-w-0 text-sm text-fg-secondary sm:block">{aside}</div>}
        {next?.kind === "link" && (
          <ButtonLink href={next.href} trailingIcon={icon}>
            {next.label}
          </ButtonLink>
        )}
        {next?.kind === "action" && (
          <Button onClick={next.onClick} disabled={next.disabled} loading={next.loading} trailingIcon={icon}>
            {next.label}
          </Button>
        )}
      </div>
    </>
  );
}
