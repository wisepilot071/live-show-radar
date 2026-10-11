"use client";

import { RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { useIntegrationStatus } from "@/features/integrations/useIntegrationStatus";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { deriveSetupStages, type SetupStageState } from "@/features/onboarding/setup-status";
import { STEPS } from "@/features/onboarding/steps";
import { cn } from "@/lib/cn";
import { StepLayout, StepNav } from "./StepLayout";

const STAGE_TONE: Record<SetupStageState, StatusTone> = {
  completed: "completed",
  in_progress: "in_progress",
  pending: "pending",
  failed: "failed",
  unavailable: "unavailable",
};

export function SetupStatusStep() {
  const router = useRouter();
  const { state, dispatch, persistence } = useOnboarding();
  const { status, retry } = useIntegrationStatus();
  const stages = deriveSetupStages(state, persistence, status);
  const hasArtists = state.selections.length > 0;

  function finish() {
    dispatch({ type: "complete", at: new Date().toISOString() });
    router.push("/radar");
  }

  return (
    <StepLayout
      width="narrow"
      eyebrow="Setup status"
      title={hasArtists ? "Your radar is configured." : "Almost there."}
      description={
        hasArtists
          ? "Here's exactly what's working now and what isn't yet. You don't need to wait on anything below."
          : "Add at least one artist so your radar has something to look for."
      }
      footer={
        <StepNav
          backHref={STEPS.alerts.path}
          next={
            hasArtists
              ? { kind: "action", label: "Go to my radar", onClick: finish }
              : { kind: "link", href: STEPS.artists.path, label: "Add artists" }
          }
        />
      }
    >
      <div className="space-y-6">
        <ol className="relative space-y-0">
          {stages.map((stage, i) => (
            <li key={stage.id} className="relative flex gap-4 pb-6 last:pb-0">
              {i < stages.length - 1 && (
                <span aria-hidden className="absolute top-9 bottom-0 left-[1.0625rem] w-px bg-line" />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative z-10 grid size-9 shrink-0 place-items-center rounded-full border font-mono text-sm",
                  stage.state === "completed"
                    ? "border-signal bg-signal text-on-signal"
                    : stage.state === "failed"
                      ? "border-urgent text-urgent"
                      : "border-line-strong bg-canvas text-fg-secondary",
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5 pt-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h2 className="font-semibold text-fg">{stage.title}</h2>
                  <StatusBadge tone={STAGE_TONE[stage.state]} />
                </div>
                <p className="text-sm text-fg-secondary">{stage.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        {status.phase === "error" && (
          <InlineAlert
            tone="error"
            live
            title="Couldn't check integration status"
            action={
              <Button variant="secondary" onClick={retry} leadingIcon={<RotateCw aria-hidden className="size-4" />}>
                Check again
              </Button>
            }
          >
            {status.message}
          </InlineAlert>
        )}

        {hasArtists && (
          <InlineAlert tone="info" title="What happens next">
            Your radar page shows your artists and cities now. Press Check now there to look for shows; the daily monitor
            keeps checking after that. Each show is marked with how well it&rsquo;s verified.
          </InlineAlert>
        )}

      </div>
    </StepLayout>
  );
}
