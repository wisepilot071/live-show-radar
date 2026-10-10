import { migrateOnboardingState, type OnboardingState } from "@/features/onboarding/state";

/**
 * Persistence boundary for the onboarding draft.
 *
 * TEMPORARY implementation: browser localStorage. It survives refresh and
 * back/forward, but it is per-browser, unsynced, and clearable by the user.
 * It is NOT account persistence. The backend part adds a server store that
 * implements this same interface; the provider does not change.
 */
export type DraftLoadResult =
  | { ok: true; draft: OnboardingState | null }
  | { ok: false; reason: "storage_unavailable" | "corrupt" };

export interface OnboardingDraftStore {
  readonly kind: "browser_draft" | "server";
  load(): DraftLoadResult;
  save(state: OnboardingState): boolean;
  clear(): void;
}

const KEY = "lsr.onboarding.v1";

function getStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    // Access can throw when storage is blocked (privacy mode / policy).
    return null;
  }
}

export const browserDraftStore: OnboardingDraftStore = {
  kind: "browser_draft",
  load() {
    const storage = getStorage();
    if (!storage) return { ok: false, reason: "storage_unavailable" };
    let raw: string | null;
    try {
      raw = storage.getItem(KEY);
    } catch {
      return { ok: false, reason: "storage_unavailable" };
    }
    if (raw === null) return { ok: true, draft: null };
    try {
      const draft = migrateOnboardingState(JSON.parse(raw) as unknown);
      return draft ? { ok: true, draft } : { ok: false, reason: "corrupt" };
    } catch {
      return { ok: false, reason: "corrupt" };
    }
  },
  save(state) {
    const storage = getStorage();
    if (!storage) return false;
    try {
      storage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch {
      return false; // quota exceeded or blocked — surfaced by the provider as "not saved"
    }
  },
  clear() {
    try {
      getStorage()?.removeItem(KEY);
    } catch {
      // Nothing to clear if storage is inaccessible.
    }
  },
};
