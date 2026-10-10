"use client";

import { useCallback, useEffect, useState } from "react";
import type { IntegrationStatusReport } from "@/integrations/status";

export type IntegrationStatusState =
  | { phase: "loading" }
  | { phase: "ready"; report: IntegrationStatusReport }
  | { phase: "error"; message: string };

/** Fetches the server's real integration status. No fallback values are invented on failure. */
export function useIntegrationStatus() {
  const [status, setStatus] = useState<IntegrationStatusState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/integrations/status", { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Status check returned ${res.status}`);
        const report = (await res.json()) as IntegrationStatusReport;
        setStatus({ phase: "ready", report });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus({ phase: "error", message: err instanceof Error ? err.message : "Status check failed" });
      });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setStatus({ phase: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { status, retry };
}
