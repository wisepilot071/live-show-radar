"use client";

import {
  AlertOctagon,
  BellOff,
  CalendarSearch,
  History,
  MapPin,
  Plug,
  Plus,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { EventCard } from "@/components/events/EventCard";
import { SaveEventButton } from "@/components/events/SaveEventButton";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { ILLUSTRATIVE_EVENTS } from "@/data/illustrative-events";
import { cityLabel } from "@/domain/cities";
import type { DiscoveryReport, LiveEvent } from "@/domain/types";
import { deriveDashboard, type DashboardSituation } from "@/features/discovery/dashboard-view";
import { useDiscovery } from "@/features/discovery/useDiscovery";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { cn } from "@/lib/cn";
import { formatTimestamp, pluralize } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useIntegrationStatus } from "@/features/integrations/useIntegrationStatus";
import { AnnouncementIntake } from "./AnnouncementIntake";

export function RadarDashboard() {
  const { state, hydrated, persistence, mode } = useOnboarding();
  const { discovery, retry, check, checkNow } = useDiscovery(mode, state.selections.length);
  const now = useNow();
  const situation: DashboardSituation =
    !hydrated || !now ? { kind: "loading" } : deriveDashboard(state, discovery, now);
  const savedIds = new Set(state.savedEvents.map((s) => s.eventId));
  const report = "report" in situation ? situation.report : undefined;
  const failedSources = report?.sources.filter((s) => s.outcome === "failed") ?? [];
  const busy = discovery.phase === "loading";
  const { status: integrations } = useIntegrationStatus();
  const alertsCell: { tone: StatusTone; label: string; detail: string } =
    integrations.phase !== "ready"
      ? { tone: "in_progress", label: "Checking", detail: "Checking alert delivery…" }
      : integrations.report.notifications.in_app !== "active"
        ? { tone: "unavailable", label: "Not available", detail: "Alerts need server storage, which isn't available here." }
        : {
            tone: "confirmed",
            label: "Inbox active",
            detail: integrations.report.scheduler.lastRun
              ? `Daily monitor last ran ${formatTimestamp(integrations.report.scheduler.lastRun.at)} (${integrations.report.scheduler.lastRun.status}).`
              : integrations.report.scheduler.configured
                ? "Daily monitor is scheduled but hasn't run yet. Check now also creates alerts."
                : "No scheduled monitor on this server; alerts come from Check now.",
          };
  const canCheck = mode === "server" && state.selections.length > 0 && situation.kind !== "not_connected";
  const coverage = report?.coverage;

  return (
    <Container width="wide" className="space-y-10 py-8 sm:py-12">
      <PageHeader
        eyebrow="Your radar"
        title="Your next show is out there."
        description="Your artists, their upcoming shows, and the moments worth acting on."
        actions={
          <>
            {canCheck && (
              <Button
                onClick={checkNow}
                loading={check.phase === "running"}
                leadingIcon={<RotateCw aria-hidden className="size-4" />}
              >
                {check.phase === "running" ? "Checking sources…" : "Check now"}
              </Button>
            )}
            <ButtonLink href="/artists" variant="secondary" leadingIcon={<Plus aria-hidden className="size-4" />}>
              Add artists
            </ButtonLink>
          </>
        }
      />

      {check.phase === "done" && (
        <InlineAlert tone="success" live title="Check finished">
          {check.summary}
        </InlineAlert>
      )}
      {check.phase === "error" && (
        <InlineAlert tone="error" live title="Check didn't run">
          {check.message}
        </InlineAlert>
      )}
      {coverage && coverage.uncovered > 0 && (
        <InlineAlert tone="warning" title={`Coverage incomplete: ${pluralize(coverage.uncovered, "artist")} can't be looked up yet`}>
          {coverage.uncoveredNames.join(", ")}
          {coverage.uncovered > coverage.uncoveredNames.length ? " and others" : ""} {coverage.uncovered === 1 ? "isn't" : "aren't"} linked
          to a MusicBrainz record, so no connected source can search for {coverage.uncovered === 1 ? "it" : "them"}.{" "}
          <a href="/artists">Link them on the Artists page.</a>
        </InlineAlert>
      )}

      {hydrated && (
        <StatusPanel
          artistCount={state.selections.length}
          primaryCityId={state.location.primaryCityId}
          nationwide={state.location.includeNationwide}
          saved={persistence !== "unavailable"}
          savedWhere={mode === "server" ? "Saved to your profile." : "Saved in this browser."}
          situation={situation}
          busy={busy}
          alerts={alertsCell}
        />
      )}

      {situation.kind === "loading" && <LoadingIndicator label="Checking your radar…" />}

      {situation.kind === "no_artists" && (
        <DashboardState
          icon={Users}
          tone="neutral"
          title="Add the artists you'd hate to miss"
          body="Your radar is built around the artists you follow. Add a few to get started — you can add the rest any time."
          action={<ButtonLink href="/artists" leadingIcon={<Plus aria-hidden className="size-4" />}>Add artists</ButtonLink>}
        />
      )}

      {situation.kind === "storage_off" && (
        <DashboardState
          icon={Plug}
          tone="neutral"
          title="Your radar is saved in this browser. Live discovery needs server storage."
          body={`Your ${pluralize(state.selections.length, "artist")} and cities are saved here, but this server's database isn't configured or reachable, so discovered shows can't be stored or shown. Nothing has been checked — this is empty for that reason, not because your artists have no shows.`}
          action={
            <ButtonLink href="#illustrative-preview" variant="ghost">
              See how shows will look
            </ButtonLink>
          }
        />
      )}

      {situation.kind === "never_checked" && (
        <DashboardState
          icon={CalendarSearch}
          tone="neutral"
          title="Ready for the first check"
          body={`Connected sources haven't looked up your artists yet. Run a check to search ${situation.report.sources
            .filter((s) => s.outcome !== "not_configured")
            .map((s) => s.sourceName)
            .join(", ")} for upcoming shows in India.`}
          action={
            <Button onClick={checkNow} loading={check.phase === "running"} leadingIcon={<RotateCw aria-hidden className="size-4" />}>
              Check now
            </Button>
          }
        />
      )}

      {situation.kind === "not_connected" && (
        <DashboardState
          icon={Plug}
          tone="neutral"
          title="Your radar is ready. Live discovery isn't connected yet."
          body={`Your ${pluralize(state.selections.length, "artist")} and cities are saved. No event source is connected to Live Show Radar yet, so we haven't looked anything up — this is empty because nothing has been checked, not because your artists have no shows.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/settings" variant="secondary" leadingIcon={<SlidersHorizontal aria-hidden className="size-4" />}>
                Adjust preferences
              </ButtonLink>
              <ButtonLink href="#illustrative-preview" variant="ghost">
                See how shows will look
              </ButtonLink>
            </div>
          }
        />
      )}

      {situation.kind === "request_failed" && (
        <DashboardState
          icon={AlertOctagon}
          tone="error"
          title="We couldn't reach the discovery service"
          body="Something went wrong on our side before any event source was asked. Your artists and preferences are safe."
          detail={situation.message}
          action={<RetryButton onRetry={retry} busy={busy} />}
        />
      )}

      {situation.kind === "sources_failed" && (
        <DashboardState
          icon={AlertOctagon}
          tone="error"
          title="Event sources couldn't be checked"
          body="Every connected source failed this time, so we can't tell you whether there are new shows. This is not the same as finding nothing."
          detail={situation.report.sources.map((s) => s.message ?? s.sourceName).join(" ")}
          action={<RetryButton onRetry={retry} busy={busy} />}
        />
      )}

      {situation.kind === "no_matches" && (
        <DashboardState
          icon={CalendarSearch}
          tone="positive"
          title="No upcoming shows found for your artists"
          body={`${situation.report.sources.filter((s) => s.outcome === "ok").map((s) => s.sourceName).join(", ")} had nothing upcoming for your artists in your cities${state.location.includeNationwide ? " or elsewhere in India" : ""}. That only covers what these sources list — paste an announcement below if you've seen one elsewhere.`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/artists" variant="secondary">Add more artists</ButtonLink>
              <ButtonLink href="/settings" variant="ghost">Widen your cities</ButtonLink>
            </div>
          }
        />
      )}

      {failedSources.length > 0 && situation.kind !== "sources_failed" && (
        <InlineAlert tone="warning" title="Some sources couldn't be checked">
          {failedSources.map((s) => s.message ?? s.sourceName).join(" ")} Results below may be incomplete.
        </InlineAlert>
      )}

      {situation.kind === "results" && (
        <>
          {situation.stale && (
            <InlineAlert
              tone="warning"
              title="These results may be outdated"
              action={<RetryButton onRetry={retry} busy={busy} />}
            >
              {situation.report.lastSuccessfulCheckAt
                ? `Last successful check: ${formatTimestamp(situation.report.lastSuccessfulCheckAt)}.`
                : "We don't have a recent successful check."}{" "}
              Dates and ticket details may have changed since.
            </InlineAlert>
          )}
          <EventSection
            id="important"
            title="Important updates"
            subtitle="New announcements, open early-bird windows, deadlines and changes."
            events={situation.important}
            empty="Nothing time-sensitive right now."
            savedIds={savedIds}
          />
          <EventSection
            id="upcoming"
            title="Upcoming shows"
            subtitle={`${cityLabel(state.location.primaryCityId).split(",")[0]} first, then your other cities.`}
            events={situation.upcoming}
            empty="No upcoming shows."
            savedIds={savedIds}
          />
        </>
      )}

      {hydrated && mode === "server" && state.selections.length > 0 && <AnnouncementIntake onExtracted={retry} />}

      {hydrated && <IllustrativePreview savedIds={savedIds} />}
    </Container>
  );
}

/* ------------------------------------------------------------------ */

function StatusPanel({
  artistCount,
  primaryCityId,
  nationwide,
  saved,
  savedWhere,
  situation,
  busy,
  alerts,
}: {
  alerts: { tone: StatusTone; label: string; detail: string };
  savedWhere: string;
  artistCount: number;
  primaryCityId: string;
  nationwide: boolean;
  saved: boolean;
  situation: DashboardSituation;
  busy: boolean;
}) {
  const report: DiscoveryReport | undefined = "report" in situation ? situation.report : undefined;
  const discovery: { tone: StatusTone; label: string; detail: string } =
    situation.kind === "loading" || busy
      ? { tone: "in_progress", label: "Checking", detail: "Asking connected sources…" }
      : situation.kind === "no_artists"
        ? { tone: "pending", label: "Waiting for artists", detail: "Add artists to start discovery." }
        : situation.kind === "not_connected"
          ? { tone: "unavailable", label: "Not connected", detail: "No event source is connected yet." }
          : situation.kind === "storage_off"
            ? { tone: "unavailable", label: "Unavailable", detail: "Server storage isn't configured, so results can't be kept." }
          : situation.kind === "never_checked"
            ? { tone: "pending", label: "Not checked yet", detail: "Run a check to look up your artists." }
          : situation.kind === "request_failed" || situation.kind === "sources_failed"
            ? { tone: "failed", label: "Check failed", detail: "See below." }
            : report?.lastSuccessfulCheckAt
              ? {
                  tone: situation.kind === "results" && situation.stale ? "stale" : "confirmed",
                  label: situation.kind === "results" && situation.stale ? "Outdated" : "Checked",
                  detail: `Last successful update ${formatTimestamp(report.lastSuccessfulCheckAt)}`,
                }
              : { tone: "unknown", label: "Unknown", detail: "No successful check recorded." };

  return (
    <section aria-label="Radar status" className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 sm:gap-px">
      <StatusCell
        label="Artist preferences"
        badge={
          artistCount === 0 ? (
            <StatusBadge tone="pending" label="None yet" />
          ) : saved ? (
            <StatusBadge tone="completed" label="Saved" />
          ) : (
            <StatusBadge tone="failed" label="Not saved" />
          )
        }
        detail={
          artistCount === 0
            ? "No artists selected."
            : `${pluralize(artistCount, "artist")} · ${cityLabel(primaryCityId).split(",")[0]} first${nationwide ? ", all India" : ""}. ${savedWhere}`
        }
        icon={MapPin}
      />
      <StatusCell
        label="Event discovery"
        badge={<StatusBadge tone={discovery.tone} label={discovery.label} />}
        detail={discovery.detail}
        icon={History}
      />
      <StatusCell label="Alerts" badge={<StatusBadge tone={alerts.tone} label={alerts.label} />} detail={alerts.detail} icon={BellOff} />
    </section>
  );
}

function StatusCell({ label, badge, detail, icon: Icon }: { label: string; badge: ReactNode; detail: string; icon: LucideIcon }) {
  return (
    <div className="space-y-2 border-b border-line bg-surface p-4 last:border-b-0 sm:border-b-0 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon aria-hidden className="size-4 text-fg-muted" />
          {label}
        </p>
        {badge}
      </div>
      <p className="text-sm text-fg-secondary">{detail}</p>
    </div>
  );
}

function DashboardState({
  icon: Icon,
  tone,
  title,
  body,
  detail,
  action,
}: {
  icon: LucideIcon;
  tone: "neutral" | "error" | "positive";
  title: string;
  body: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "grain flex flex-col items-center gap-4 rounded-xl border px-6 py-12 text-center sm:py-14",
        tone === "error" && "border-urgent/40 bg-urgent/[0.04]",
        tone === "neutral" && "border-dashed border-line-strong",
        tone === "positive" && "border-line bg-surface",
      )}
    >
      <span
        className={cn(
          "grid size-14 place-items-center rounded-full border",
          tone === "error" ? "border-urgent/40 text-urgent" : tone === "positive" ? "border-signal/40 text-signal" : "border-line text-fg-secondary",
        )}
      >
        <Icon aria-hidden className="size-6" />
      </span>
      <h2 className="max-w-xl font-display text-2xl font-bold tracking-tight text-balance">{title}</h2>
      <p className="max-w-xl text-fg-secondary">{body}</p>
      {detail && <p className="max-w-xl font-mono text-xs text-fg-muted">{detail}</p>}
      {action}
    </section>
  );
}

function RetryButton({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  return (
    <Button variant="secondary" onClick={onRetry} loading={busy} leadingIcon={<RotateCw aria-hidden className="size-4" />}>
      Try again
    </Button>
  );
}

function EventSection({
  id,
  title,
  subtitle,
  events,
  empty,
  savedIds,
}: {
  id: string;
  title: string;
  subtitle: string;
  events: LiveEvent[];
  empty: string;
  savedIds: Set<string>;
}) {
  const { state } = useOnboarding();
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div>
        <h2 id={`${id}-title`} className="font-display text-2xl font-bold tracking-tight">
          {title}
        </h2>
        <p className="text-sm text-fg-secondary">{subtitle}</p>
      </div>
      {events.length === 0 ? (
        <p className="rounded-lg border border-line/70 bg-surface p-4 text-sm text-fg-secondary">{empty}</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => (
            <li key={e.id}>
              <EventCard
                event={e}
                location={state.location}
                detailHref={`/radar/events/${encodeURIComponent(e.id)}`}
                saved={savedIds.has(e.id)}
                actions={<SaveEventButton event={e} />}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function IllustrativePreview({ savedIds }: { savedIds: Set<string> }) {
  const { state } = useOnboarding();
  return (
    <section
      id="illustrative-preview"
      aria-labelledby="illustrative-title"
      className="scroll-mt-20 space-y-5 rounded-xl border border-dashed border-line-strong p-4 sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 id="illustrative-title" className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <Sparkles aria-hidden className="size-5 text-fg-secondary" />
            Illustrative preview — not live concert data
          </h2>
          <p className="max-w-2xl text-sm text-fg-secondary">
            Fictional artists and venues showing every kind of card your radar can show. None of these shows exist and
            none come from an event source. You can save them to try Saved shows; they stay labelled as examples.
          </p>
        </div>
        <StatusBadge tone="example" label="Examples" className="self-start" />
      </div>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ILLUSTRATIVE_EVENTS.map((e) => (
          <li key={e.id}>
            <EventCard
              event={e}
              location={state.location}
              detailHref={`/radar/events/${e.id}`}
              saved={savedIds.has(e.id)}
              actions={<SaveEventButton event={e} />}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
