"use client";

import { useCallback, useEffect, useState } from "react";
import type { DiscoveryReport } from "@/domain/types";
import type { ProfileMode } from "@/features/onboarding/OnboardingProvider";

export type DiscoveryState =
  | { phase: "idle" } // nothing to show yet (still loading the profile, or no artists)
  | { phase: "storage_off" } // server storage not configured/reachable → no stored events to show
  | { phase: "loading"; previous?: DiscoveryReport }
  | { phase: "ready"; report: DiscoveryReport }
  | { phase: "error"; message: string; previous?: DiscoveryReport };

export type CheckState =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; summary: string }
  | { phase: "error"; message: string };

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };
type Fetched = { key: string } & ({ ok: true; report: DiscoveryReport } | { ok: false; message: string });

/**
 * Reads stored events + real discovery status from /api/me/events, and runs
 * an on-demand "Check now" via /api/me/discovery. A request failure ("we
 * couldn't ask") is kept separate from source failures inside a report.
 * Only fetched results are stored; idle / storage-off / loading are derived.
 */
export function useDiscovery(mode: ProfileMode, artistCount: number) {
  const [fetched, setFetched] = useState<Fetched | null>(null);
  const [lastGood, setLastGood] = useState<DiscoveryReport | undefined>(undefined);
  const [check, setCheck] = useState<CheckState>({ phase: "idle" });
  const [attempt, setAttempt] = useState(0);
  const key = `${attempt}|${artistCount}`;
  const shouldFetch = mode === "server" && artistCount > 0;

  useEffect(() => {
    if (!shouldFetch) return;
    const controller = new AbortController();
    fetch("/api/me/events", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as Envelope<{ report: DiscoveryReport }>;
        if (!body.ok) throw new Error(body.error.message);
        setFetched({ key, ok: true, report: body.data.report });
        setLastGood(body.data.report);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setFetched({ key, ok: false, message: err instanceof Error ? err.message : "Couldn't load your shows." });
      });
    return () => controller.abort();
  }, [shouldFetch, key]);

  const result: DiscoveryState =
    mode === "loading"
      ? { phase: "idle" }
      : mode !== "server"
        ? { phase: "storage_off" }
        : artistCount === 0
          ? { phase: "idle" }
          : !fetched || fetched.key !== key
            ? { phase: "loading", previous: lastGood }
            : fetched.ok
              ? { phase: "ready", report: fetched.report }
              : { phase: "error", message: fetched.message, previous: lastGood };

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  const checkNow = useCallback(async () => {
    setCheck({ phase: "running" });
    try {
      const res = await fetch("/api/me/discovery", { method: "POST", cache: "no-store" });
      const body = (await res.json()) as Envelope<{
        run: { status: string; sources?: Array<{ sourceName: string; status: string; artistsChecked: number; eventsNew: number; eventsUpdated: number }> };
        report: DiscoveryReport;
      }>;
      if (!body.ok) return setCheck({ phase: "error", message: body.error.message });
      const { run, report } = body.data;
      setFetched({ key, ok: true, report });
      setLastGood(report);
      const parts = (run.sources ?? []).map(
        (s) =>
          `${s.sourceName}: ${s.status === "skipped" ? "nothing due" : s.status === "failed" ? "failed" : `${s.artistsChecked} checked, ${s.eventsNew} new, ${s.eventsUpdated} updated`}`,
      );
      setCheck({
        phase: "done",
        summary: run.status === "no_artists" ? "Add artists first." : parts.join(" · ") || "Nothing to check.",
      });
    } catch {
      setCheck({ phase: "error", message: "Couldn't reach the server to run a check." });
    }
  }, [key]);

  return { discovery: result, retry, check, checkNow };
}
