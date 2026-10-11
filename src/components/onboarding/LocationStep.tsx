"use client";

import { LocationPreferenceSelector } from "@/components/preferences/LocationPreferenceSelector";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { STEPS } from "@/features/onboarding/steps";
import { useOnboardingSubmit } from "@/features/onboarding/useOnboardingSubmit";
import { StepLayout, StepNav } from "./StepLayout";

export function LocationStep() {
  const submit = useOnboardingSubmit();
  return (
    <StepLayout
      eyebrow="Where you'll go"
      title="Your city first. The rest of India too."
      description="Shows in your home city rank highest. Other cities are prioritised lower — never hidden unless you switch them off."
      footer={
        <StepNav
          backHref={STEPS.artists.path}
          next={{
            kind: "action",
            label: submit.busy ? "Saving…" : "Continue",
            onClick: () => void submit.advance(STEPS.alerts.path),
            loading: submit.busy,
          }}
        />
      }
    >
      {submit.error && (
        <InlineAlert tone="error" live title="Your cities didn't save" className="mb-6">
          {submit.error}
        </InlineAlert>
      )}
      <LocationPreferenceSelector />
    </StepLayout>
  );
}
