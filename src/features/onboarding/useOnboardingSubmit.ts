"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { finishOnboarding } from "./finish";
import { useOnboarding } from "./OnboardingProvider";
import { ONBOARDING_DONE_PATH } from "./steps";

/**
 * Button state for "save, then move on". `advance(path)` waits for every
 * queued write and navigates only if they all succeeded; `finish()` also
 * records completion and opens the radar. One submission at a time; on
 * failure the user stays put with a message and can retry.
 */
export function useOnboardingSubmit() {
  const router = useRouter();
  const { state, run, flush } = useOnboarding();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function guard(task: () => Promise<string | null>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const message = await task();
    if (message) {
      setError(message);
      setBusy(false);
      inFlight.current = false;
    }
  }

  return {
    busy,
    error,
    advance: (path: string) =>
      guard(async () => {
        if (!(await flush())) {
          return "Some of your changes didn't save. What's on screen now is what's saved — check it and try again.";
        }
        router.push(path);
        return null;
      }),
    finish: () =>
      guard(async () => {
        const r = await finishOnboarding({
          method: state.method,
          artistCount: state.selections.length,
          run,
          flush,
          navigate: (path) => router.push(path),
          donePath: ONBOARDING_DONE_PATH,
        });
        return r.ok ? null : r.message;
      }),
  };
}
