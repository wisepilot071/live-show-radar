import type { ArtistAcquisitionMethod } from "@/domain/types";
import type { SyncResult } from "./server-sync";
import type { OnboardingAction } from "./state";

export type FinishResult = { ok: true } | { ok: false; message: string };

/**
 * Ends onboarding after artist selection. Order matters:
 *   1. wait for every queued artist write to reach the server (flush)
 *   2. record the method (manual by default) and completion via the existing
 *      preferences endpoint
 *   3. navigate to the radar — only if every write succeeded
 * On any failure nothing navigates; the selection stays on screen (the
 * provider restores the server's copy) and the user can retry. Retrying is
 * safe: artist follows are idempotent and completion is a plain update.
 */
export async function finishOnboarding(deps: {
  method: ArtistAcquisitionMethod | null;
  artistCount: number;
  run: (action: OnboardingAction) => Promise<SyncResult>;
  flush: () => Promise<boolean>;
  navigate: (path: string) => void;
  now?: () => Date;
  donePath?: string;
}): Promise<FinishResult> {
  const now = deps.now ?? (() => new Date());
  if (deps.artistCount === 0) return { ok: false, message: "Pick at least one artist to continue." };

  const writesOk = await deps.flush();
  if (!writesOk) {
    return {
      ok: false,
      message: "Some of your artist changes didn't save. Your list now shows what's saved — check it and try again.",
    };
  }
  if (deps.method === null) {
    const m = await deps.run({ type: "choose_method", method: "manual" });
    if (!m.ok) return { ok: false, message: m.error.message };
  }
  const done = await deps.run({ type: "complete", at: now().toISOString() });
  if (!done.ok) return { ok: false, message: done.error.message };

  deps.navigate(deps.donePath ?? "/radar");
  return { ok: true };
}
