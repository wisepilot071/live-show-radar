"use client";

import { AlertPreferenceSelector } from "@/components/preferences/AlertPreferenceSelector";
import { NotificationChannelList } from "@/components/preferences/NotificationChannelList";
import { STEPS } from "@/features/onboarding/steps";
import { StepLayout, StepNav } from "./StepLayout";

export function AlertsStep() {
  return (
    <StepLayout
      width="narrow"
      eyebrow="What matters"
      title="Tell us what's worth a nudge."
      description="Plain choices — no schedules or settings to tune. You can fine-tune more in Settings later."
      footer={
        <StepNav backHref={STEPS.location.path} next={{ kind: "link", href: STEPS.status.path, label: "Continue" }} />
      }
    >
      <div className="space-y-8">
        <section aria-labelledby="triggers-heading" className="space-y-3">
          <h2 id="triggers-heading" className="font-display text-xl font-bold">
            Let me know about
          </h2>
          <AlertPreferenceSelector only={["new_announcement", "ticket_window_change", "date_or_venue_change"]} />
        </section>

        <section aria-labelledby="channels-heading" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="channels-heading" className="font-display text-xl font-bold">
              Where to reach you
            </h2>
          </div>
          <p className="text-sm text-fg-secondary">
            Alerts land in your in-app Inbox. Other channels show their real status — we won&rsquo;t say a channel is
            active until it really is.
          </p>
          <NotificationChannelList />
        </section>
      </div>
    </StepLayout>
  );
}
