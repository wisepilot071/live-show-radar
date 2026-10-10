"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { browserDraftStore, type OnboardingDraftStore } from "@/persistence/onboarding-draft-store";
import { fetchServerProfile, importDraftToServer, syncAction, type SyncResult } from "./server-sync";
import { initialOnboardingState, onboardingReducer, type OnboardingAction, type OnboardingState } from "./state";

/**
 * Single owner of the user's radar profile on the client.
 *
 * Modes (decided once on load, re-checkable via `reload`):
 * - server  — /api/me/profile answered: the server is the source of truth.
 *             Every action is applied optimistically, then sent to the API in
 *             order. If a write fails, state is reloaded from the server (so the
 *             UI never shows a change that wasn't saved) and `syncError` is set.
 * - browser — server storage isn't configured: localStorage draft, as in Part 2.
 * - offline — server storage is configured but unreachable: browser draft is
 *             used and the UI says changes are only kept in this browser.
 * A browser draft is moved to the server once, when the server profile is empty.
 */
export type ProfileMode = "loading" | "server" | "browser" | "offline";
export type DraftPersistence = "loading" | "saved" | "unavailable" | "recovered" | "server";

interface OnboardingContextValue {
  state: OnboardingState;
  /** Fire-and-forget; failures surface through `syncError`. */
  dispatch: (action: OnboardingAction) => void;
  /** Awaitable; resolve before showing a success message. */
  run: (action: OnboardingAction) => Promise<SyncResult>;
  hydrated: boolean;
  mode: ProfileMode;
  persistence: DraftPersistence;
  storeKind: OnboardingDraftStore["kind"] | "server";
  syncError: string | null;
  clearSyncError: () => void;
  reload: () => void;
  /** Set once when a browser draft was moved to the server. */
  migratedFromBrowser: boolean;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children, store = browserDraftStore }: { children: ReactNode; store?: OnboardingDraftStore }) {
  const [state, setState] = useState<OnboardingState>(initialOnboardingState);
  const stateRef = useRef(state);
  const [mode, setMode] = useState<ProfileMode>("loading");
  const modeRef = useRef<ProfileMode>("loading");
  const [persistence, setPersistence] = useState<DraftPersistence>("loading");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [migratedFromBrowser, setMigrated] = useState(false);
  const [loadNonce, setLoadNonce] = useState(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const replaceState = useCallback((next: OnboardingState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const loadBrowser = useCallback(
    (asMode: "browser" | "offline") => {
      const result = store.load();
      if (result.ok) {
        if (result.draft) replaceState(result.draft);
        setPersistence(asMode === "offline" ? "unavailable" : "saved");
      } else if (result.reason === "corrupt") {
        store.clear();
        setPersistence("recovered");
      } else {
        setPersistence("unavailable");
      }
      modeRef.current = asMode;
      setMode(asMode);
    },
    [store, replaceState],
  );

  // Decide the mode and load the profile.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const server = await fetchServerProfile();
      if (cancelled) return;
      if (server.kind === "not_configured") return loadBrowser("browser");
      if (server.kind === "error") {
        setSyncError(`${server.message} Changes are kept in this browser until it's back.`);
        return loadBrowser("offline");
      }
      let profile = server.profile;
      const serverEmpty = profile.selections.length === 0 && profile.savedEvents.length === 0 && profile.updatedAt === null;
      const local = store.load();
      if (serverEmpty && local.ok && local.draft && (local.draft.selections.length > 0 || local.draft.savedEvents.length > 0)) {
        const imported = await importDraftToServer(local.draft);
        if (cancelled) return;
        if (imported) {
          profile = imported;
          store.clear();
          setMigrated(true);
        }
      }
      replaceState(profile);
      modeRef.current = "server";
      setMode("server");
      setPersistence("server");
    })();
    return () => {
      cancelled = true;
    };
  }, [loadNonce, loadBrowser, replaceState, store]);

  const run = useCallback(
    (action: OnboardingAction): Promise<SyncResult> => {
      const before = stateRef.current;
      const after = onboardingReducer(before, action);
      if (after === before) return Promise.resolve({ ok: true }); // no-op (e.g. duplicate save)
      replaceState(after);

      if (modeRef.current !== "server") {
        const saved = store.save(after);
        setPersistence(saved ? (modeRef.current === "offline" ? "unavailable" : "saved") : "unavailable");
        return Promise.resolve({ ok: true });
      }

      // Server mode: serialise writes so they reach the API in order.
      const job = queue.current.then(async (): Promise<SyncResult> => {
        const result = await syncAction(action, before, after);
        if (!result.ok) {
          setSyncError(`${result.error.message} Your last change wasn't saved, so we restored what's on the server.`);
          const fresh = await fetchServerProfile();
          if (fresh.kind === "server") replaceState(fresh.profile);
        }
        return result;
      });
      queue.current = job.catch(() => undefined);
      return job;
    },
    [replaceState, store],
  );

  const dispatch = useCallback((action: OnboardingAction) => void run(action), [run]);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      state,
      dispatch,
      run,
      hydrated: mode !== "loading",
      mode,
      persistence,
      storeKind: mode === "server" ? "server" : store.kind,
      syncError,
      clearSyncError: () => setSyncError(null),
      reload: () => {
        setSyncError(null);
        setMode("loading");
        modeRef.current = "loading";
        setLoadNonce((n) => n + 1);
      },
      migratedFromBrowser,
    }),
    [state, dispatch, run, mode, persistence, store.kind, syncError, migratedFromBrowser],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used inside <OnboardingProvider>");
  return ctx;
}
