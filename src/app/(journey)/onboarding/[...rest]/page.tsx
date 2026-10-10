import { notFound } from "next/navigation";

/** Any unknown /onboarding/* path renders the onboarding not-found screen. */
export default function UnknownOnboardingStep() {
  notFound();
}
