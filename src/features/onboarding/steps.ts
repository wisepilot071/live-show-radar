import type { ArtistAcquisitionMethod } from "@/domain/types";

export type OnboardingStepId = "method" | "spotify" | "artists" | "location" | "alerts";

export interface StepMeta {
  id: OnboardingStepId;
  path: string;
  label: string;
}

export const STEPS: Record<OnboardingStepId, StepMeta> = {
  method: { id: "method", path: "/onboarding", label: "Start" },
  spotify: { id: "spotify", path: "/onboarding/spotify", label: "Spotify" },
  artists: { id: "artists", path: "/onboarding/artists", label: "Artists" },
  location: { id: "location", path: "/onboarding/location", label: "Cities" },
  alerts: { id: "alerts", path: "/onboarding/alerts", label: "Alerts" },
};

/** Where onboarding ends: the radar dashboard, entered straight after artist selection. */
export const ONBOARDING_DONE_PATH = "/radar";

/**
 * Pick artists → cities → alerts → radar, whatever the stored method. There is
 * no review step, and Spotify is only a "coming soon" card on the artists
 * step (no import exists), so the old method/spotify screens redirect here.
 */
export function stepSequence(): OnboardingStepId[] {
  return ["artists", "location", "alerts"];
}

export function nextStep(method: ArtistAcquisitionMethod | null, current: OnboardingStepId): StepMeta | null {
  void method; // kept for API compatibility; every path is the same now
  const seq = stepSequence();
  const i = seq.indexOf(current);
  const id = i === -1 ? undefined : seq[i + 1];
  return id ? STEPS[id] : null;
}

export function previousStep(method: ArtistAcquisitionMethod | null, current: OnboardingStepId): StepMeta | null {
  void method; // kept for API compatibility; every path is the same now
  const seq = stepSequence();
  const i = seq.indexOf(current);
  // A step outside the current sequence (e.g. /spotify after switching to manual) goes back to the start.
  if (i === -1) return STEPS.method;
  const id = seq[i - 1];
  return id ? STEPS[id] : null;
}
