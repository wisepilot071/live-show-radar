"use client";

import { Check, Combine, Search, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { nextStep } from "@/features/onboarding/steps";
import type { ArtistAcquisitionMethod } from "@/domain/types";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { StepLayout, StepNav } from "./StepLayout";

function SpotifyIcon(props: { className?: string }) {
  // Generic sound-wave glyph; we do not use Spotify's trademarked logo.
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={props.className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9.5c3.4-1 7.2-.7 10 1M7.6 12.6c2.8-.8 5.8-.5 8.2.9M8.3 15.5c2.1-.5 4.3-.3 6.1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const OPTIONS: Array<{
  method: ArtistAcquisitionMethod;
  title: string;
  body: string;
  benefit: string;
  icon: LucideIcon | typeof SpotifyIcon;
}> = [
  {
    method: "manual",
    title: "Choose artists manually",
    body: "Search for the artists you already love.",
    benefit: "Fastest way to start. Works without any account.",
    icon: Search,
  },
  {
    method: "spotify",
    title: "Connect Spotify",
    body: "Discover artists using the Spotify data available through the permissions you grant.",
    benefit: "Optional. Spotify import isn't available yet — you can still continue manually.",
    icon: SpotifyIcon,
  },
  {
    method: "mix",
    title: "Mix both",
    body: "Import what's available, then add any missing favourites yourself.",
    benefit: "Duplicates are merged automatically.",
    icon: Combine,
  },
];

export function MethodStep() {
  const router = useRouter();
  const { state, dispatch, mode } = useOnboarding();
  const where = mode === "server" ? "in your profile" : "in this browser";
  const selected = state.method;
  const hasProgress = state.selections.length > 0;
  const [confirmReset, setConfirmReset] = useState(false);

  function choose(method: ArtistAcquisitionMethod) {
    dispatch({ type: "choose_method", method });
  }

  function continueOn() {
    const next = nextStep(state.method, "method");
    if (next) router.push(next.path);
  }

  return (
    <StepLayout
      eyebrow="Build your radar"
      title="Where should we start?"
      description="Choose the easiest way to find the artists you never want to miss. You can change this later."
      footer={
        <StepNav
          backHref="/"
          backLabel="Home"
          aside={selected ? `Starting with: ${OPTIONS.find((o) => o.method === selected)?.title}` : "Pick one to continue"}
          next={{ kind: "action", label: "Continue", onClick: continueOn, disabled: !selected }}
        />
      }
    >
      <div className="space-y-6">
        {hasProgress && (
          <InlineAlert
            tone="info"
            title={`You have ${pluralize(state.selections.length, "artist")} saved ${where}`}
            action={
              <Button variant="quiet" onClick={() => setConfirmReset(true)}>
                Start over instead
              </Button>
            }
          >
            Pick a method and continue — your selections are kept.
          </InlineAlert>
        )}

        <fieldset>
          <legend className="sr-only">How do you want to add artists?</legend>
          <div className="grid gap-4 md:grid-cols-3">
            {OPTIONS.map((opt) => {
              const isSelected = selected === opt.method;
              const Icon = opt.icon;
              return (
                <label
                  key={opt.method}
                  className={cn(
                    "group relative flex cursor-pointer flex-col gap-4 rounded-xl border p-5 transition-[border-color,background-color,box-shadow] duration-[var(--duration-base)] sm:p-6",
                    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-fg",
                    isSelected
                      ? "border-signal-ink bg-signal/30 shadow-signal"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-2",
                  )}
                >
                  <input
                    type="radio"
                    name="method"
                    value={opt.method}
                    checked={isSelected}
                    onChange={() => choose(opt.method)}
                    className="sr-only"
                  />
                  <div className="flex items-start justify-between">
                    <span
                      className={cn(
                        "grid size-12 place-items-center rounded-lg border transition-colors",
                        isSelected ? "border-signal-ink/50 bg-signal text-on-signal" : "border-line bg-inset text-fg",
                      )}
                    >
                      <Icon className="size-6" aria-hidden />
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-6 place-items-center rounded-full border transition-colors",
                        isSelected ? "animate-pop border-signal-ink bg-signal text-on-signal" : "border-line-strong",
                      )}
                    >
                      {isSelected && <Check className="size-4" strokeWidth={3} />}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <p className="font-display text-xl font-bold tracking-tight">{opt.title}</p>
                    <p className="text-fg-secondary">{opt.body}</p>
                  </div>
                  <p className="mt-auto border-t border-line/60 pt-3 text-sm text-fg-muted">{opt.benefit}</p>
                  {isSelected && <span className="sr-only">Selected</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Start over?"
        description={`This clears your ${pluralize(state.selections.length, "artist")}, saved shows and preferences ${where}. It can't be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Keep my progress
            </Button>
            <Button
              variant="secondary"
              className="border-urgent/60 text-urgent-ink hover:bg-urgent/10"
              onClick={() => {
                dispatch({ type: "reset" });
                setConfirmReset(false);
              }}
            >
              Start over
            </Button>
          </>
        }
      />
    </StepLayout>
  );
}
