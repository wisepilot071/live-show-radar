"use client";

import {
  AlertOctagon,
  Bell,
  CalendarSearch,
  Plug,
  Plus,
  Radio,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Ticket,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { EventCard } from "@/components/events/EventCard";
import { HeroBackdrop } from "@/components/media/HeroBackdrop";
import { LiveOnStage } from "@/components/media/LiveOnStage";
import { EventActions } from "@/components/events/EventActions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { ILLUSTRATIVE_EVENTS } from "@/data/illustrative-events";
import { artistIdentityKey } from "@/domain/artist-identity";
import { cityLabel, INITIAL_CITIES } from "@/domain/cities";
import type { DiscoveryReport, LiveEvent } from "@/domain/types";
import { deriveDashboard, type DashboardSituation } from "@/features/discovery/dashboard-view";
import { applyFilters, buildSections, DEFAULT_FILTERS, genreOptions, type DiscoveryFilters } from "@/features/discovery/sections";
import { useDiscovery } from "@/features/discovery/useDiscovery";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { useBookings } from "@/features/bookings/BookingsProvider";
import { cn } from "@/lib/cn";
import { formatTimestamp, pluralize } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { useIntegrationStatus } from "@/features/integrations/useIntegrationStatus";
import { AnnouncementIntake } from "./AnnouncementIntake";
import { EventGridSkeleton } from "@/components/ui/Skeletons";

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
  const bookings = useBookings();
  const bookingsCell: { tone: StatusTone; label: string; detail: string } =
    bookings.phase === "storage_off"
      ? { tone: "unavailable", label: "Unavailable", detail: "Bookings need server storage." }
      : bookings.phase !== "ready"
        ? { tone: "in_progress", label: "Loading", detail: "Loading your bookings…" }
        : bookings.bookings.length === 0
          ? { tone: "unknown", label: "None yet", detail: "Bought a ticket? Press “I’ve booked my ticket” on the show." }
          : {
              tone: "completed",
              label: `${bookings.bookings.length} booked`,
              detail: `${bookings.bookings.filter((b) => b.calendar.status === "synced").length} in Google Calendar · confirmed by you.`,
            };
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
    <Container width="wide" className="space-y-10 py-6 sm:py-10">
      <DiscoverHero
        artistCount={state.selections.length}
        primaryCityId={state.location.primaryCityId}
        nationwide={state.location.includeNationwide}
        hydrated={hydrated}
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
            <ButtonLink
              href="/artists"
              variant="onInk"
              leadingIcon={<Plus aria-hidden className="size-4" />}
            >
              Add artists
            </ButtonLink>
          </>
        }
        status={
          hydrated ? (
            <StatusPanel
              artistCount={state.selections.length}
              primaryCityId={state.location.primaryCityId}
              nationwide={state.location.includeNationwide}
              saved={persistence !== "unavailable"}
              savedWhere={mode === "server" ? "Saved to your profile." : "Saved in this browser."}
              situation={situation}
              busy={busy}
              alerts={alertsCell}
              bookings={bookingsCell}
            />
          ) : null
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

      {situation.kind === "loading" && <EventGridSkeleton label="Checking your radar…" />}

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
          <DiscoverySectionsView events={situation.upcoming} />
        </>
      )}

      {hydrated && <LiveOnStage />}

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
  bookings,
}: {
  alerts: { tone: StatusTone; label: string; detail: string };
  bookings: { tone: StatusTone; label: string; detail: string };
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
    <section aria-label="Radar status" className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatusCell
        label="Your artists"
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
        icon={Users}
      />
      <StatusCell
        label="Event discovery"
        badge={<StatusBadge tone={discovery.tone} label={discovery.label} />}
        detail={discovery.detail}
        icon={Radio}
      />
      <StatusCell label="Alerts" badge={<StatusBadge tone={alerts.tone} label={alerts.label} />} detail={alerts.detail} icon={Bell} />
      <StatusCell
        label="My bookings"
        badge={<StatusBadge tone={bookings.tone} label={bookings.label} />}
        detail={bookings.detail}
        icon={Ticket}
        href="/bookings"
      />
    </section>
  );
}

/** Status cells sit on the ink hero, so each one is a light card. */
function StatusCell({
  label,
  badge,
  detail,
  icon: Icon,
  href,
}: {
  label: string;
  badge: ReactNode;
  detail: string;
  icon: LucideIcon;
  href?: string;
}) {
  const Tag = href ? "a" : "div";
  return (
    <Tag {...(href ? { href } : {})} className={cn("block space-y-2 rounded-lg bg-surface p-4 text-fg", href && "transition-shadow hover:shadow-raised")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Icon aria-hidden className="size-4 text-fg-muted" />
          {label}
        </p>
        {badge}
      </div>
      <p className="text-sm text-fg-secondary">{detail}</p>
    </Tag>
  );
}

/** Compact hero: what this page is for, the user's real setup, and the next action. */
function DiscoverHero({
  artistCount,
  primaryCityId,
  nationwide,
  hydrated,
  actions,
  status,
}: {
  artistCount: number;
  primaryCityId: string;
  nationwide: boolean;
  hydrated: boolean;
  actions: ReactNode;
  status: ReactNode;
}) {
  const city = cityLabel(primaryCityId).split(",")[0];
  return (
    <section aria-labelledby="discover-title" className="on-ink relative isolate animate-rise overflow-hidden rounded-[1.75rem] bg-ink text-on-ink shadow-[0_30px_60px_-35px_rgb(32_40_32/0.6)]">
      <HeroBackdrop />
      <div className="grid gap-6 p-5 pt-12 sm:p-8 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:pt-24">
        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-[0.12em] text-signal uppercase">Discover</p>
          <h1 id="discover-title" className="font-display text-[clamp(1.9rem,4.4vw,3.1rem)] leading-[1.02] font-semibold">
            Your artists. Your next unforgettable night.
          </h1>
          <p className="max-w-2xl text-on-ink/80">
            {hydrated && artistCount > 0
              ? `Watching ${pluralize(artistCount, "artist")} across ${nationwide ? "India" : "your cities"}, with ${city} first. Sources are checked daily, and ticket windows are flagged only when a source confirms them.`
              : "Follow artists and we will look for their shows across India, with your city first."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {status && <div className="border-t border-on-ink/10 bg-ink/40 p-3 backdrop-blur-[2px] sm:p-4">{status}</div>}
    </section>
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
      {/* Radar rings: the brand motif, static (no implied activity). */}
      <span aria-hidden className="relative grid size-24 place-items-center">
        <span className={cn("absolute inset-0 rounded-full border", tone === "error" ? "border-urgent/25" : "border-line")} />
        <span className={cn("absolute inset-3.5 rounded-full border", tone === "error" ? "border-urgent/40" : "border-line-strong/70")} />
        <span
          className={cn(
            "relative grid size-14 place-items-center rounded-full bg-surface shadow-card ring-1",
            tone === "error" ? "text-urgent-ink ring-urgent/40" : tone === "positive" ? "text-signal-ink ring-signal-ink/40" : "text-fg-secondary ring-line",
          )}
        >
          <Icon className="size-6" strokeWidth={1.75} />
        </span>
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

/** Filters + discovery sections, all over the real events from /api/me/events. */
function DiscoverySectionsView({ events }: { events: LiveEvent[] }) {
  const { state } = useOnboarding();
  const now = useNow();
  const [filters, setFilters] = useState<DiscoveryFilters>(DEFAULT_FILTERS);
  if (!now) return null;
  const filtered = applyFilters(events, filters, { selections: state.selections, now });
  const sections = buildSections(filtered, state.location, now);
  const savedIds = new Set(state.savedEvents.map((s) => s.eventId));
  const city = cityLabel(state.location.primaryCityId).split(",")[0];
  const active = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="space-y-12">
      <FilterBar filters={filters} onChange={setFilters} count={filtered.length} total={events.length} />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-line-strong p-6">
          <p className="font-semibold">No shows match these filters.</p>
          <p className="text-sm text-fg-secondary">
            {pluralize(events.length, "show")} on your radar — try widening the city or dates.
          </p>
          {active && (
            <Button variant="secondary" onClick={() => setFilters(DEFAULT_FILTERS)} leadingIcon={<X aria-hidden className="size-4" />}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <>
          {sections.attention.length > 0 && (
            <EventSection
              id="attention"
              title="Needs your attention"
              subtitle="Verified early-bird deadlines inside a week, cancellations and changed details."
              events={sections.attention}
              savedIds={savedIds}
              tone="urgent"
            />
          )}
          <EventSection
            id="just-announced"
            title="Just announced"
            subtitle="Announced in the last 7 days, going by the source's own announcement time — not when we found it."
            events={sections.justAnnounced}
            empty="Nothing announced this week for your artists."
            savedIds={savedIds}
          />
          <EventSection
            id="from-your-artists"
            title="From your artists"
            subtitle={`Every upcoming show from the artists you follow — ${city} first, then the rest of India.`}
            events={sections.fromYourArtists}
            empty="No upcoming shows from your artists."
            savedIds={savedIds}
          />
          <EventSection
            id="tickets"
            title="Tickets available"
            subtitle="Tickets a source confirms are on sale, with a real ticket link."
            events={sections.ticketsAvailable}
            empty="No verified on-sale tickets yet. When a source confirms a sale, it shows up here."
            savedIds={savedIds}
          />
          <EventSection
            id="early-bird"
            title="Early bird & presale"
            subtitle="Only when a source confirms the window — deadlines are never guessed."
            events={sections.earlyBird}
            empty="No verified early-bird or presale windows right now."
            savedIds={savedIds}
          />
          <EventSection
            id="coming-soon"
            title="Coming soon"
            subtitle="Announced shows whose tickets aren't on sale yet, or that have a confirmed sale date."
            events={sections.comingSoon}
            empty="No confirmed upcoming sale dates."
            savedIds={savedIds}
          />
          <EventSection
            id="beyond"
            title={`Beyond ${city}`}
            subtitle="Shows elsewhere in India — worth a trip?"
            events={sections.beyondHome}
            empty={`Nothing outside ${city} right now.`}
            savedIds={savedIds}
          />
        </>
      )}
    </div>
  );
}

function FilterBar({
  filters,
  onChange,
  count,
  total,
}: {
  filters: DiscoveryFilters;
  onChange: (f: DiscoveryFilters) => void;
  count: number;
  total: number;
}) {
  const { state } = useOnboarding();
  const genres = genreOptions(state.selections);
  const active = JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS);
  const set = <K extends keyof DiscoveryFilters>(k: K, v: DiscoveryFilters[K]) => onChange({ ...filters, [k]: v });
  return (
    <section aria-label="Filter shows" className="space-y-3 rounded-xl bg-surface-2 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SlidersHorizontal aria-hidden className="size-4 text-fg-muted" />
        <FilterSelect label="City" value={filters.city} onChange={(v) => set("city", v)}>
          <option value="all">All of India</option>
          {INITIAL_CITIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Dates" value={filters.when} onChange={(v) => set("when", v as DiscoveryFilters["when"])}>
          <option value="any">Any date</option>
          <option value="30d">Next 30 days</option>
          <option value="90d">Next 3 months</option>
        </FilterSelect>
        <FilterSelect label="Artist" value={filters.artist} onChange={(v) => set("artist", v)}>
          <option value="all">All my artists</option>
          {state.selections.map((s) => (
            <option key={artistIdentityKey(s.artist)} value={artistIdentityKey(s.artist)}>
              {s.artist.name}
            </option>
          ))}
        </FilterSelect>
        {genres.length > 0 && (
          <FilterSelect label="Genre" value={filters.genre} onChange={(v) => set("genre", v)}>
            <option value="all">All genres</option>
            {genres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </FilterSelect>
        )}
        {active && (
          <Button variant="ghost" onClick={() => onChange(DEFAULT_FILTERS)} leadingIcon={<X aria-hidden className="size-4" />}>
            Clear
          </Button>
        )}
      </div>
      <p className="text-sm text-fg-secondary" aria-live="polite">
        {active ? `${pluralize(count, "show")} of ${total} match your filters.` : `${pluralize(total, "upcoming show")} on your radar.`}
      </p>
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "h-10 max-w-[13rem] appearance-none truncate rounded-full border bg-surface pr-4 pl-3.5 text-sm font-semibold transition-colors focus:border-fg focus:outline-none",
          value === "all" || value === "any" ? "border-line text-fg-secondary" : "border-fg text-fg",
        )}
      >
        {children}
      </select>
    </div>
  );
}

function EventSection({
  id,
  title,
  subtitle,
  events,
  empty,
  savedIds,
  tone,
}: {
  id: string;
  title: string;
  subtitle: string;
  events: LiveEvent[];
  empty?: string;
  savedIds: Set<string>;
  tone?: "urgent";
}) {
  const { state } = useOnboarding();
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-1">
          <h2 id={`${id}-title`} className="flex items-center gap-2 font-display text-[1.7rem] leading-tight font-semibold">
            {tone === "urgent" && <span aria-hidden className="size-2.5 rounded-full bg-urgent" />}
            {title}
          </h2>
          <p className="text-sm text-fg-secondary">{subtitle}</p>
        </div>
        {events.length > 0 && <p className="text-sm font-semibold text-fg-secondary tabular-nums">{pluralize(events.length, "show")}</p>}
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-fg-muted">{empty}</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
          {events.map((e) => (
            <li key={e.id}>
              <EventCard
                event={e}
                location={state.location}
                detailHref={`/radar/events/${encodeURIComponent(e.id)}`}
                saved={savedIds.has(e.id)}
                actions={<EventActions event={e} />}
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
              actions={<EventActions event={e} />}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
