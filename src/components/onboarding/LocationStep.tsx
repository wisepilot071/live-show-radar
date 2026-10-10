"use client";

import { LocationPreferenceSelector } from "@/components/preferences/LocationPreferenceSelector";
import { STEPS } from "@/features/onboarding/steps";
import { StepLayout, StepNav } from "./StepLayout";

export function LocationStep() {
  return (
    <StepLayout
      eyebrow="Where you'll go"
      title="Your city first. The rest of India too."
      description="Shows in your home city rank highest. Other cities are prioritised lower — never hidden unless you switch them off."
      footer={
        <StepNav backHref={STEPS.review.path} next={{ kind: "link", href: STEPS.alerts.path, label: "Continue" }} />
      }
    >
      <LocationPreferenceSelector />
    </StepLayout>
  );
}
