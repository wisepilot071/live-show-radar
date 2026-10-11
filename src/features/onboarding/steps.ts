import type { ArtistAcquisitionMethod } from "@/domain/types";

export type OnboardingStepId = "method" | "spotify" | "artists";

export interface StepMeta {
  id: OnboardingStepId;
  path: string;
  label: string;
}

export const STEPS: Record<OnboardingStepId, StepMeta> = {
  method: { id: "method", path: "/onboarding", label: "Start" },
  spotify: { id: "spotify", path: "/onboarding/spotify", label: "Spotify" },
  artists: { id: "artists", path: "/onboarding/artists", label: "Artists" },
};

/** Where onboarding ends: the radar dashboard, entered straight after artist selection. */
export const ONBOARDING_DONE_PATH = "/radar";

/**
 * Onboarding ends at artist selection: picking artists and pressing Continue
 * saves them and opens the radar. Cities and alerts start from sensible
 * defaults (Bengaluru first, all India, every alert on) and live in Settings.
 *   no method yet (the default entry) → artists
 *   manual  → method, artists
 *   spotify → method, spotify, artists   (Spotify always hands over to search)
 *   mix     → method, spotify, artists
 */
export function stepSequence(method: ArtistAcquisitionMethod | null): OnboardingStepId[] {
  if (method === null) return ["artists"];
  return method === "manual" ? ["method", "artists"] : ["method", "spotify", "artists"];
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
