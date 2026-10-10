"use client";

import { InlineAlert } from "@/components/ui/InlineAlert";
import { Switch } from "@/components/ui/Switch";
import type { AlertTrigger } from "@/domain/types";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";

export const ALERT_TRIGGERS: Array<{ id: AlertTrigger; label: string; description: string }> = [
  {
    id: "new_announcement",
    label: "New shows announced",
    description: "When one of your artists announces a show in your cities or elsewhere in India.",
  },
  {
    id: "ticket_window_change",
    label: "Ticket sales & early-bird windows",
    description: "When a source confirms a sale date, presale or early-bird window. We never guess these.",
  },
  {
    id: "deadline_approaching",
    label: "Approaching ticket deadlines",
    description: "A reminder when a verified early-bird deadline is a few days away.",
  },
  {
    id: "date_or_venue_change",
    label: "Date or venue changes",
    description: "When a show you could attend moves, is postponed or is cancelled.",
  },
  {
    id: "outside_primary_city",
    label: "Shows outside your home city",
    description: "Include announcements in other Indian cities. Turn off to hear only about your home and priority cities.",
  },
];

/** The trigger switches. Onboarding shows a core subset; Settings shows all. */
export function AlertPreferenceSelector({ only }: { only?: AlertTrigger[] }) {
  const { state, dispatch } = useOnboarding();
  const triggers = only ? ALERT_TRIGGERS.filter((t) => only.includes(t.id)) : ALERT_TRIGGERS;
  const anyOn = triggers.some((t) => state.notifications.triggers[t.id]);
  return (
    <div className="space-y-3">
      {triggers.map((t) => (
        <Switch
          key={t.id}
          checked={state.notifications.triggers[t.id]}
          onChange={(value) => dispatch({ type: "set_trigger", trigger: t.id, value })}
          label={t.label}
          description={t.description}
        />
      ))}
      {!anyOn && (
        <InlineAlert tone="warning" live>
          Everything is off, so you won&rsquo;t hear about changes. You can still browse your radar.
        </InlineAlert>
      )}
    </div>
  );
}
