import type { ArtistAcquisitionMethod } from "@/domain/types";

export type OnboardingStepId = "method" | "spotify" | "artists" | "review" | "location" | "alerts" | "status";

export interface StepMeta {
  id: OnboardingStepId;
  path: string;
  label: string;
}

export const STEPS: Record<OnboardingStepId, StepMeta> = {
  method: { id: "method", path: "/onboarding", label: "Start" },
  spotify: { id: "spotify", path: "/onboarding/spotify", label: "Spotify" },
  artists: { id: "artists", path: "/onboarding/artists", label: "Artists" },
  review: { id: "review", path: "/onboarding/review", label: "Review" },
  location: { id: "location", path: "/onboarding/location", label: "Cities" },
  alerts: { id: "alerts", path: "/onboarding/alerts", label: "Alerts" },
  status: { id: "status", path: "/onboarding/status", label: "Setup" },
};

/**
 * The step sequence is derived from the chosen method:
 *   spotify → method, spotify, review, …
 *   manual  → method, artists, review, …
 *   mix     → method, spotify, artists, review, …
 * With no method yet (e.g. a deep link), the manual path is assumed.
 */
export function stepSequence(method: ArtistAcquisitionMethod | null): OnboardingStepId[] {
  const acquisition: OnboardingStepId[] =
    method === "spotify" ? ["spotify"] : method === "mix" ? ["spotify", "artists"] : ["artists"];
  return ["method", ...acquisition, "review", "location", "alerts", "status"];
}

export function nextStep(method: ArtistAcquisitionMethod | null, current: OnboardingStepId): StepMeta | null {
  const seq = stepSequence(method);
  const i = seq.indexOf(current);
  const id = i === -1 ? undefined : seq[i + 1];
  return id ? STEPS[id] : null;
}

export function previousStep(method: ArtistAcquisitionMethod | null, current: OnboardingStepId): StepMeta | null {
  const seq = stepSequence(method);
  const i = seq.indexOf(current);
  // A step outside the current sequence (e.g. /spotify after switching to manual) goes back to the start.
  if (i === -1) return STEPS.method;
  const id = seq[i - 1];
  return id ? STEPS[id] : null;
}
