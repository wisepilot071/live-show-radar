"use client";

import { Cloud, CloudOff, HardDrive, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { SyncErrorBanner } from "@/components/app/SyncErrorBanner";
import { Container } from "@/components/ui/Container";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { OnboardingProgress } from "./OnboardingProgress";

/**
 * Returning users who already finished setup go straight to their radar.
 * Checked once, on the first hydrated render, so finishing onboarding in this
 * session (which sets completedAt optimistically) never navigates early —
 * that navigation happens only after the save succeeds. `?edit=1` (from
 * Settings → Run setup again) opts back in.
 */
function useReturningUserRedirect() {
  const { state, hydrated } = useOnboarding();
  const router = useRouter();
  const checked = useRef(false);
  useEffect(() => {
    if (!hydrated || checked.current) return;
    checked.current = true;
    const editing = new URLSearchParams(window.location.search).get("edit") === "1";
    if (state.completedAt && !editing) router.replace("/radar");
  }, [hydrated, state.completedAt, router]);
}

/** Focused shell for the onboarding journey: logo, honest save indicator, exit, progress. */
export function OnboardingFrame({ children }: { children: ReactNode }) {
  useReturningUserRedirect();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-line/60 bg-canvas/90 backdrop-blur-md">
        <Container width="wide" className="flex min-h-16 items-center justify-between gap-3">
          <BrandMark />
          <div className="flex items-center gap-1 sm:gap-3">
            <SaveIndicator />
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-fg-secondary hover:bg-surface hover:text-fg"
            >
              <X aria-hidden className="size-4" />
              <span>
                Exit<span className="sr-only"> setup (your progress is kept)</span>
              </span>
            </Link>
          </div>
        </Container>
        <Container width="wide" className="pb-3 empty:hidden">
          <OnboardingProgress />
        </Container>
      </header>
      <main id="main" className="flex-1">
        <SyncErrorBanner className="mx-4 mt-4 sm:mx-6" />
        {children}
      </main>
    </div>
  );
}

/** Says exactly where progress is kept: server profile, this browser, or nowhere. */
function SaveIndicator() {
  const { persistence, mode } = useOnboarding();
  if (persistence === "loading") return null;
  const view =
    mode === "server"
      ? { Icon: Cloud, label: "Saved to your profile", title: "Saved on the server, tied to this browser's profile cookie.", warn: false }
      : persistence === "unavailable"
        ? { Icon: CloudOff, label: "Not saved", title: "Storage is unavailable, so progress may be lost on refresh.", warn: true }
        : { Icon: HardDrive, label: "Saved in this browser", title: "Server storage isn't configured, so progress is kept in this browser only.", warn: false };
  return (
    <p
      role="status"
      title={view.title}
      className="hidden items-center gap-1.5 text-xs font-medium text-fg-muted sm:flex"
    >
      <view.Icon aria-hidden className={view.warn ? "size-3.5 text-warning" : "size-3.5"} />
      {view.label}
    </p>
  );
}
