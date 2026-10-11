"use client";

import { Bookmark, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { EventCard } from "@/components/events/EventCard";
import { EventActions } from "@/components/events/EventActions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { SelectField } from "@/components/ui/SelectField";
import { findCity } from "@/domain/cities";
import { deriveEventSignals, type EventSignals } from "@/domain/event-signals";
import type { SavedEvent } from "@/domain/types";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { cn } from "@/lib/cn";
import { pluralize } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { PageSkeleton } from "@/components/ui/Skeletons";

type FilterId = "all" | "primary" | "elsewhere" | "upcoming" | "verify";
type SortId = "show_date" | "recently_saved";

interface Row {
  saved: SavedEvent;
  signals: EventSignals;
  time: number | null;
}

const FILTER_TEST: Record<FilterId, (r: Row) => boolean> = {
  all: () => true,
  primary: (r) => r.signals.locality === "primary",
  elsewhere: (r) => r.signals.locality !== "primary",
  upcoming: (r) => r.signals.isUpcoming,
  verify: (r) => r.signals.needsVerification,
};

export function SavedShows() {
  const { state, hydrated, mode } = useOnboarding();
  const now = useNow();
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<SortId>("show_date");
  const primaryName = findCity(state.location.primaryCityId)?.name ?? "Your city";

  const rows = useMemo<Row[]>(() => {
    if (!now) return [];
    return state.savedEvents.map((saved) => {
      const e = saved.snapshot;
      const time = e.when.startsAt ? Date.parse(e.when.startsAt) : e.when.date ? Date.parse(`${e.when.date}T12:00:00Z`) : null;
      return { saved, signals: deriveEventSignals(e, now, state.location), time };
    });
  }, [state.savedEvents, state.location, now]);

  const filters: Array<{ id: FilterId; label: string }> = [
    { id: "all", label: "All" },
    { id: "primary", label: primaryName },
    { id: "elsewhere", label: "Other cities" },
    { id: "upcoming", label: "Upcoming" },
    { id: "verify", label: "Needs verification" },
  ];

  const visible = rows.filter(FILTER_TEST[filter]).sort((a, b) =>
    sort === "recently_saved"
      ? b.saved.savedAt.localeCompare(a.saved.savedAt)
      : (a.time ?? Number.POSITIVE_INFINITY) - (b.time ?? Number.POSITIVE_INFINITY),
  );
  const exampleCount = state.savedEvents.filter((s) => s.snapshot.origin === "illustrative").length;

  if (!hydrated || !now) {
    return <PageSkeleton label="Loading saved shows…" body="cards" />;
  }

  return (
    <Container width="wide" className="space-y-8 py-8 sm:py-12">
      <PageHeader
        atmosphere="festival-sunset"
        eyebrow="Saved shows"
        title={state.savedEvents.length ? `${pluralize(state.savedEvents.length, "show")} you're keeping an eye on` : "Saved shows"}
        description="Shows you want to come back to."
      />

      {state.savedEvents.length === 0 ? (
        <EmptyState
          doodle="bookmark"
          icon={Bookmark}
          title="Nothing saved yet"
          action={<ButtonLink href="/radar">Go to your radar</ButtonLink>}
        >
          Tap <span className="font-semibold text-on-ink">Save</span> on any show to keep it here. Saved shows stay{" "}
          {mode === "server" ? "in your profile." : "in this browser."}
        </EmptyState>
      ) : (
        <>
          <p className="flex items-start gap-2 text-sm text-fg-secondary">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info" />
            <span>
              Each card shows the details as they were when you saved them. They aren&rsquo;t refreshed automatically —
              monitoring isn&rsquo;t active yet.
              {exampleCount > 0 && ` ${pluralize(exampleCount, "saved show")} ${exampleCount === 1 ? "is an example" : "are examples"} from the illustrative preview.`}
            </span>
          </p>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-fg">Show</legend>
              <div className="flex flex-wrap gap-2">
                {filters.map((f) => {
                  const count = rows.filter(FILTER_TEST[f.id]).length;
                  const active = filter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setFilter(f.id)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                        active
                          ? "border-signal-ink bg-signal/30 text-fg"
                          : "border-line bg-surface text-fg-secondary hover:border-line-strong hover:text-fg",
                      )}
                    >
                      {f.label}
                      <span className={cn("font-mono text-xs tabular-nums", active ? "text-signal-ink" : "text-fg-muted")}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <SelectField
              label="Sort by"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortId)}
              className="lg:w-56"
            >
              <option value="show_date">Date of show</option>
              <option value="recently_saved">Recently saved</option>
            </SelectField>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No saved shows match this filter"
              action={
                <Button variant="secondary" onClick={() => setFilter("all")}>
                  Show all saved shows
                </Button>
              }
            />
          ) : (
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map(({ saved }) => (
                <li key={saved.eventId}>
                  <EventCard
                    event={saved.snapshot}
                    location={state.location}
                    detailHref={`/radar/events/${encodeURIComponent(saved.eventId)}`}
                    saved
                    actions={<EventActions event={saved.snapshot} />}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Container>
  );
}
