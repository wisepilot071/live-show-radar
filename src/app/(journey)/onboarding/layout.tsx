import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OnboardingFrame } from "@/components/onboarding/OnboardingFrame";

export const metadata: Metadata = { title: "Build your radar" };

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <OnboardingFrame>{children}</OnboardingFrame>;
}
