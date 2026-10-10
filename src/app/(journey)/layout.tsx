import type { ReactNode } from "react";
import { OnboardingProvider } from "@/features/onboarding/OnboardingProvider";

/**
 * Everything that reads or writes the user's radar configuration lives under
 * this group, so one provider owns that state for onboarding and /radar.
 */
export default function JourneyLayout({ children }: { children: ReactNode }) {
  return <OnboardingProvider>{children}</OnboardingProvider>;
}
