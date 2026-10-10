import type { IntegrationStatusState } from "@/features/integrations/useIntegrationStatus";
import type { DraftPersistence } from "./OnboardingProvider";
import type { OnboardingState } from "./state";

export type SetupStageState = "completed" | "in_progress" | "pending" | "failed" | "unavailable";

export interface SetupStage {
  id: "preferences" | "sources" | "verification" | "delivery";
  title: string;
  state: SetupStageState;
  detail: string;
}

/**
 * Derives first-run stages from real signals only:
 * - preferences: whether the draft store actually accepted the write
 * - sources / delivery: the server's /api/integrations/status report
 * Nothing is marked complete because a button was pressed.
 */
export function deriveSetupStages(
  state: OnboardingState,
  persistence: DraftPersistence,
  integrations: IntegrationStatusState,
): SetupStage[] {
  const artists = state.selections.length;

  const preferences: SetupStage =
    artists === 0
      ? { id: "preferences", title: "Artist preferences saved", state: "pending", detail: "No artists selected yet." }
      : persistence === "unavailable"
        ? {
            id: "preferences",
            title: "Artist preferences saved",
            state: "failed",
            detail: "This browser blocked storage, so your choices will be lost on refresh.",
          }
        : persistence === "loading"
          ? { id: "preferences", title: "Artist preferences saved", state: "in_progress", detail: "Saving…" }
          : {
              id: "preferences",
              title: "Artist preferences saved",
              state: "completed",
              detail:
                persistence === "server"
                  ? `${artists} artist${artists === 1 ? "" : "s"} and your preferences are saved to your profile on the server.`
                  : `${artists} artist${artists === 1 ? "" : "s"} and your preferences are saved in this browser only (server storage isn't available).`,
            };

  let sources: SetupStage;
  let delivery: SetupStage;
  if (integrations.phase === "loading") {
    sources = { id: "sources", title: "Event sources checked", state: "in_progress", detail: "Checking which sources are connected…" };
    delivery = { id: "delivery", title: "Notification delivery configured", state: "in_progress", detail: "Checking…" };
  } else if (integrations.phase === "error") {
    sources = {
      id: "sources",
      title: "Event sources checked",
      state: "failed",
      detail: "Couldn't reach the status service. Try again.",
    };
    delivery = {
      id: "delivery",
      title: "Notification delivery configured",
      state: "failed",
      detail: "Couldn't reach the status service. Try again.",
    };
  } else {
    const connected = integrations.report.eventSources.connected;
    sources =
      connected.length === 0
        ? {
            id: "sources",
            title: "Event sources checked",
            state: "unavailable",
            detail: "No event sources are connected to Live Show Radar yet, so no shows are being looked up.",
          }
        : {
            id: "sources",
            title: "Event sources checked",
            state: "pending",
            detail: `${connected.map((c) => c.name).join(", ")} connected. Run your first check from the radar page.`,
          };
    const inApp = integrations.report.notifications.in_app === "active";
    delivery = inApp
      ? {
          id: "delivery",
          title: "Notification delivery configured",
          state: "completed",
          detail: `In-app Inbox is active.${integrations.report.emailReason ? " Email isn't configured on this server." : ""}`,
        }
      : {
          id: "delivery",
          title: "Notification delivery configured",
          state: "unavailable",
          detail: "Alerts need server storage, which isn't available here. No alerts will be created.",
        };
  }

  const verification: SetupStage =
    sources.state === "unavailable" || sources.state === "failed"
      ? {
          id: "verification",
          title: "Event information verified",
          state: "unavailable",
          detail: "Waits on event sources. Nothing has been verified.",
        }
      : sources.state === "in_progress"
        ? { id: "verification", title: "Event information verified", state: "pending", detail: "Waits on the source check." }
        : { id: "verification", title: "Event information verified", state: "pending", detail: "Runs after the first source check." };

  return [preferences, sources, verification, delivery];
}
