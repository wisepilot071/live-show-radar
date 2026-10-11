"use client";

import { ArrowRight, Bell, Database, HardDrive, Link2, MapPin, RotateCcw, Users, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { AlertPreferenceSelector } from "@/components/preferences/AlertPreferenceSelector";
import { GoogleCalendarConnect } from "@/components/preferences/GoogleCalendarConnect";
import { LocationPreferenceSelector } from "@/components/preferences/LocationPreferenceSelector";
import { NotificationChannelList } from "@/components/preferences/NotificationChannelList";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Container } from "@/components/ui/Container";
import { Dialog } from "@/components/ui/Dialog";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useIntegrationStatus } from "@/features/integrations/useIntegrationStatus";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { formatTimestamp, pluralize } from "@/lib/format";
import { PageSkeleton } from "@/components/ui/Skeletons";

const SECTIONS = [
  { id: "location", label: "Location" },
  { id: "artists", label: "Artists" },
  { id: "alerts", label: "Alerts" },
  { id: "connections", label: "Connections" },
  { id: "data", label: "Your data" },
] as const;

export function SettingsPage() {
  const { state, run, hydrated, persistence, mode } = useOnboarding();
  const { status } = useIntegrationStatus();
  const toast = useToast();
  const [confirmReset, setConfirmReset] = useState(false);

  if (!hydrated) {
    return <PageSkeleton label="Loading settings…" body="form" />;
  }

  const report = status.phase === "ready" ? status.report : null;
  const typedCount = state.selections.filter((s) => s.artist.origin === "user_entered").length;

  return (
    <Container width="default" className="space-y-10 py-8 sm:py-12">
      <PageHeader
        atmosphere="panorama-band"
        eyebrow="Settings"
        title="Tune your radar."
        description={
          mode === "server"
            ? "Changes save to your profile as you make them."
            : "Changes save as you make them, in this browser."
        }
      />

      <nav aria-label="Settings sections" className="-mt-4 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-sm text-fg-secondary transition-colors hover:border-line-strong hover:text-fg"
          >
            {s.label}
          </a>
        ))}
      </nav>

      <SettingsSection id="location" icon={MapPin} title="Location" description="Your home city ranks first. Other cities are prioritised lower, not hidden.">
        <LocationPreferenceSelector />
      </SettingsSection>

      <SettingsSection id="artists" icon={Users} title="Artists" description="The artists your radar is built around.">
        <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-display text-3xl font-bold tabular-nums">{state.selections.length}</p>
            <p className="text-sm text-fg-secondary">
              {pluralize(state.selections.length, "artist", "artists")} followed
              {typedCount > 0 && ` · ${typedCount} not matched to a catalogue record yet`}
            </p>
          </div>
          <ButtonLink href="/artists" variant="secondary" trailingIcon={<ArrowRight aria-hidden className="size-4" />}>
            Manage artists
          </ButtonLink>
        </Card>
      </SettingsSection>

      <SettingsSection id="alerts" icon={Bell} title="Alerts" description="What's worth a nudge. These decide which alerts reach your Inbox (and email, when configured).">
        {report && (
          <InlineAlert tone="info" title="How alerts are checked">
            {report.scheduler.configured
              ? `Scheduled monitoring: ${report.scheduler.cadence}. ${report.scheduler.lastRun ? `Last run ${formatTimestamp(report.scheduler.lastRun.at)} (${report.scheduler.lastRun.status}).` : "It hasn't run yet on this server."}`
              : "Scheduled monitoring isn't configured on this server (CRON_SECRET not set)."}{" "}
            Alerts are also created when you press Check now on your radar. Only verified, fresh information triggers an alert.
          </InlineAlert>
        )}
        <AlertPreferenceSelector />
        <h3 className="pt-4 font-semibold text-fg">Delivery channels</h3>
        <NotificationChannelList />
      </SettingsSection>

      <SettingsSection id="connections" icon={Link2} title="Connections" description="Real connection status only — nothing here is assumed.">
        {status.phase === "loading" && <LoadingIndicator label="Checking connections…" />}
        {status.phase === "error" && (
          <InlineAlert tone="error" title="Couldn't check connection status">
            {status.message}
          </InlineAlert>
        )}
        <GoogleCalendarConnect />
        {report && (
          <ul className="divide-y divide-line/60 overflow-hidden rounded-xl border border-line bg-surface shadow-card">
            <ConnectionRow
              name="Spotify"
              tone="unavailable"
              label="Coming soon"
              detail="Importing the artists you follow on Spotify is planned for a future update. Nothing connects to Spotify today — your artist list works without it."
            />
            {report.unavailableSources.map((s) => (
              <ConnectionRow key={s.id} name={`Event source · ${s.name}`} tone="unavailable" label="Not integrated" detail={s.reason} />
            ))}
            {report.eventSources.all.map((s) => (
              <ConnectionRow
                key={s.id}
                name={`Event source · ${s.name}`}
                tone={!s.configured ? "unavailable" : s.lastRun?.status === "failed" ? "failed" : s.lastSuccessAt ? "confirmed" : "pending"}
                label={
                  !s.configured
                    ? "Not configured"
                    : s.lastRun?.status === "failed"
                      ? "Last check failed"
                      : s.lastSuccessAt
                        ? "Working"
                        : "Configured · not run yet"
                }
                detail={
                  !s.configured
                    ? `${s.reason ?? "Not configured"}.`
                    : [
                        s.lastSuccessAt ? `Last successful check ${formatTimestamp(s.lastSuccessAt)}.` : "No successful check recorded yet.",
                        s.lastRun?.status === "failed" ? `Latest run failed (${s.lastRun.errorCategory?.replace(/_/g, " ") ?? "error"}).` : "",
                        s.id === "musicbrainz" ? "Community data — has no ticket availability, and lists few upcoming Indian shows." : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                }
              />
            ))}
            <ConnectionRow
              name="Gemini (announcement reading)"
              tone={!report.gemini.configured ? "unavailable" : report.gemini.lastSuccessAt ? "confirmed" : "pending"}
              label={!report.gemini.configured ? "Not configured" : report.gemini.lastSuccessAt ? "Working" : "Configured · not used yet"}
              detail={
                report.gemini.configured
                  ? `Model ${report.gemini.model}${report.gemini.fallbackModel ? ` (fallback ${report.gemini.fallbackModel})` : ""}. ${
                      report.gemini.lastSuccessAt ? `Last successful extraction ${formatTimestamp(report.gemini.lastSuccessAt)}.` : "No successful request recorded yet."
                    }`
                  : "GEMINI_API_KEY isn't set, so pasted announcements can't be read."
              }
            />
            <ConnectionRow
              name="Artist catalogue"
              tone={report.artistSearch.source === "live" ? "confirmed" : "example"}
              label={report.artistSearch.label}
              detail={
                report.artistSearch.source === "live"
                  ? "Live search with stable MusicBrainz ids, so same-named artists stay distinct."
                  : "Search uses a small sample catalogue (MusicBrainz is switched off)."
              }
            />
            <ConnectionRow
              name="Database"
              tone={!report.database.configured ? "unavailable" : report.database.reachable ? "confirmed" : "failed"}
              label={!report.database.configured ? "Not configured" : report.database.reachable ? "Reachable" : "Unreachable"}
              detail={report.persistence.label}
            />
          </ul>
        )}
      </SettingsSection>

      <SettingsSection id="data" icon={Database} title="Your data" description="Where your radar lives right now.">
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <HardDrive aria-hidden className="size-4.5 text-fg-muted" />
            <p className="font-semibold">{mode === "server" ? "Saved to your profile on the server" : "Saved in this browser only"}</p>
            <StatusBadge
              tone={persistence === "unavailable" ? "failed" : "completed"}
              label={persistence === "unavailable" ? "Not saving" : "Saving"}
            />
          </div>
          <p className="text-sm text-fg-secondary">
            {mode === "server" ? (
              <>
                There are no accounts yet: your profile is anonymous and tied to a private cookie in this browser. Your
                artists, cities, alert choices and {pluralize(state.savedEvents.length, "saved show")} survive refreshes and
                restarts, but clearing cookies or switching device starts a new, empty profile.
              </>
            ) : (
              <>
                Server storage isn&rsquo;t available, so your artists, cities, alert choices and{" "}
                {pluralize(state.savedEvents.length, "saved show")} stay on this device only. Clearing site data removes them.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2 border-t border-line/60 pt-4">
            <ButtonLink href="/onboarding/artists?edit=1" variant="ghost">
              Run setup again
            </ButtonLink>
            <Button
              variant="secondary"
              className="border-urgent/50 text-urgent-ink hover:bg-urgent/10"
              leadingIcon={<RotateCcw aria-hidden className="size-4" />}
              onClick={() => setConfirmReset(true)}
            >
              Reset everything
            </Button>
          </div>
        </Card>
      </SettingsSection>

      <Dialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Reset your radar?"
        description={`This removes ${pluralize(state.selections.length, "artist")}, ${pluralize(state.savedEvents.length, "saved show")} and all preferences${mode === "server" ? " from your profile" : " from this browser"}. It can't be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              className="border-urgent/60 text-urgent-ink hover:bg-urgent/10"
              onClick={async () => {
                setConfirmReset(false);
                const r = await run({ type: "reset" });
                if (r.ok) toast({ message: "Your radar was reset.", tone: "info" });
              }}
            >
              Reset everything
            </Button>
          </>
        }
      />
    </Container>
  );
}

function SettingsSection({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4 border-t border-line/60 pt-8">
      <div className="space-y-1">
        <h2 id={`${id}-title`} className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          <Icon aria-hidden className="size-5 text-signal-ink" />
          {title}
        </h2>
        <p className="text-fg-secondary">{description}</p>
      </div>
      {children}
    </section>
  );
}

function ConnectionRow({ name, tone, label, detail }: { name: string; tone: StatusTone; label: string; detail: string }) {
  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="font-semibold text-fg">{name}</p>
        <p className="text-sm text-fg-secondary">{detail}</p>
      </div>
      <StatusBadge tone={tone} label={label} className="shrink-0 self-start" />
    </li>
  );
}
