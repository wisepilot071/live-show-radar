"use client";

import { MapPin, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { EventActions } from "@/components/events/EventActions";
import { EventCard } from "@/components/events/EventCard";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { EventGridSkeleton } from "@/components/ui/Skeletons";
import { findCity } from "@/domain/cities";
import type { LiveEvent } from "@/domain/types";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { pluralize } from "@/lib/format";

type Load = { phase: "loading" } | { phase: "ready"; events: LiveEvent[] } | { phase: "error" };
const DAYS = 60;

/**
 * Every upcoming show we know of in a city over the next 2 months — for ANY
 * tracked artist (the catalogue and everyone's follows), not only yours.
 * Your home city first; Bengaluru second when your home is elsewhere.
 */
export function CityUpcoming() {
  const { state } = useOnboarding();
  const home = state.location.primaryCityId;
  const cities = home === "bengaluru" ? ["bengaluru"] : [home, "bengaluru"];
  return (
    <div className="space-y-12">
      {cities.map((c) => (
        <CitySection key={c} cityId={c} />
      ))}
    </div>
  );
}

function CitySection({ cityId }: { cityId: string }) {
  const { state } = useOnboarding();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [nonce, setNonce] = useState(0);
  const city = findCity(cityId)?.name ?? cityId;

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/events/city?city=${encodeURIComponent(cityId)}&days=${DAYS}`, { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json()) as { ok: boolean; data?: { events: LiveEvent[] } };
        if (!r.ok || !body.ok || !body.data) throw new Error("bad response");
        setLoad({ phase: "ready", events: body.data.events });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ phase: "error" });
      });
    return () => controller.abort();
  }, [cityId, nonce]);

  const savedIds = new Set(state.savedEvents.map((s) => s.eventId));
  return (
    <section aria-labelledby={`city-${cityId}`} className="space-y-5">
      <Reveal className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-signal-ink uppercase">
            <span aria-hidden className="relative grid size-2.5 place-items-center">
              <span className="absolute inset-0 animate-ping-soft rounded-full bg-urgent/60" />
              <span className="size-2 rounded-full bg-urgent" />
            </span>
            Live · from real sources
          </p>
          <h2 id={`city-${cityId}`} className="flex items-center gap-2 font-display text-[1.7rem] leading-tight font-semibold sm:text-[2rem]">
            <MapPin aria-hidden className="size-6 shrink-0 text-signal-ink" />
            <span className="relative inline-block pb-1">
              Coming to {city} · next 2 months
              {/* Hand-drawn underline that draws itself in when the section scrolls into view. */}
              <svg aria-hidden viewBox="0 0 300 12" preserveAspectRatio="none" className="absolute -bottom-1.5 left-0 h-3 w-full text-signal-ink">
                <path
                  d="M2 8 C 60 2, 120 11, 180 5 S 270 3, 298 7"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  pathLength={1}
                  className="animate-draw [stroke-dasharray:1] [animation-delay:200ms] [animation-duration:1.4s]"
                />
              </svg>
            </span>
          </h2>
          <p className="text-fg-secondary">
            Real shows from Ticketmaster, MusicBrainz and news reports — each card links to where it came from. Follow any
            artist to get alerts.
          </p>
        </div>
        {load.phase === "ready" && load.events.length > 0 && <p className="text-sm text-fg-muted">{pluralize(load.events.length, "show")}</p>}
      </Reveal>
      {load.phase === "loading" && <EventGridSkeleton label={`Loading shows in ${city}…`} />}
      {load.phase === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-fg-secondary">
          <span className="flex-1">Shows in {city} couldn&rsquo;t load right now.</span>
          <Button
            variant="secondary"
            leadingIcon={<RotateCw aria-hidden className="size-4" />}
            onClick={() => {
              setLoad({ phase: "loading" });
              setNonce((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {load.phase === "ready" && load.events.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong p-5 text-sm text-fg-secondary">
          No shows by tracked artists found in {city} for the next 2 months yet. News for {city} is checked daily, and every
          followed artist is looked up on a rolling schedule.
        </p>
      )}
      {load.phase === "ready" && load.events.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2 xl:grid-cols-3">
          {load.events.map((e) => (
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
      )}
    </section>
  );
}
