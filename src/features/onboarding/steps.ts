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
 * Pick artists → cities → alerts → radar. There is no review step: the
 * artist list isn't confirmed a second time. Each Continue saves first.
 *   no method yet (the default entry) → artists, location, alerts
 *   manual  → method, artists, location, alerts
 *   spotify / mix → method, spotify, artists, location, alerts
 *                   (Spotify always hands over to search)
 */
export function stepSequence(method: ArtistAcquisitionMethod | null): OnboardingStepId[] {
  const tail: OnboardingStepId[] = ["artists", "location", "alerts"];
  if (method === null) return tail;
  return method === "manual" ? ["method", ...tail] : ["method", "spotify", ...tail];
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
