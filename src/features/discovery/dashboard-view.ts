import { compareByPriority, deriveEventSignals, isInLocationScope } from "@/domain/event-signals";
import type { DiscoveryReport, LiveEvent } from "@/domain/types";
import type { OnboardingState } from "@/features/onboarding/state";
import type { DiscoveryState } from "./useDiscovery";

/** A successful check older than this makes stored results "possibly outdated". */
// Daily scheduled checks (Vercel Hobby cron) + slack for cron timing jitter.
export const STALE_AFTER_HOURS = 30;

/**
 * Which situation the dashboard is in. Each maps to a distinct UI — "no
 * events found" and "the check failed" are never the same state.
 */
export type DashboardSituation =
  | { kind: "loading" }
  | { kind: "no_artists" }
  | { kind: "storage_off" } // server storage not configured/reachable
  | { kind: "not_connected" } // no event source configured
  | { kind: "never_checked"; report: DiscoveryReport }
  | { kind: "request_failed"; message: string } // couldn't reach our own API
  | { kind: "sources_failed"; report: DiscoveryReport } // reached it; every source failed
  | { kind: "no_matches"; report: DiscoveryReport }
  | { kind: "results"; report: DiscoveryReport; stale: boolean; important: LiveEvent[]; upcoming: LiveEvent[] };

export function deriveDashboard(
  state: Pick<OnboardingState, "selections" | "location">,
  discovery: DiscoveryState,
  now: Date,
): DashboardSituation {
  if (discovery.phase === "storage_off") return state.selections.length === 0 ? { kind: "no_artists" } : { kind: "storage_off" };
  if (state.selections.length === 0) return { kind: "no_artists" };
  if (discovery.phase === "idle" || discovery.phase === "loading") {
    if (discovery.phase === "loading" && discovery.previous) return fromReport(discovery.previous, state, now);
    return { kind: "loading" };
  }
  if (discovery.phase === "error") return { kind: "request_failed", message: discovery.message };
  return fromReport(discovery.report, state, now);
}

function fromReport(report: DiscoveryReport, state: Pick<OnboardingState, "location">, now: Date): DashboardSituation {
  if (report.status === "not_connected") return { kind: "not_connected" };
  if (report.status === "database_unavailable") return { kind: "storage_off" };

  const inScope = report.events.filter((e) => isInLocationScope(e, state.location));
  const live = inScope.filter((e) => !deriveEventSignals(e, now, state.location).isPast);

  // Stored events from earlier checks are still worth showing even if the latest check failed.
  if (live.length === 0) {
    if (report.status === "never_checked") return { kind: "never_checked", report };
    if (report.status === "error") return { kind: "sources_failed", report };
    return { kind: "no_matches", report };
  }

  const sorted = [...live].sort(compareByPriority(state.location));
  const important = sorted.filter((e) => deriveEventSignals(e, now, state.location).isImportant);
  const stale =
    report.status === "error" ||
    !report.lastSuccessfulCheckAt ||
    now.getTime() - Date.parse(report.lastSuccessfulCheckAt) > STALE_AFTER_HOURS * 3_600_000;
  return { kind: "results", report, stale, important, upcoming: sorted };
}
