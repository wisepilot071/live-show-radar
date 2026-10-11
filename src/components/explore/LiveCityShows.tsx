"use client";

import { MapPin, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { EventCard } from "@/components/events/EventCard";
import { Button } from "@/components/ui/Button";
import { EventGridSkeleton } from "@/components/ui/Skeletons";
import type { LiveEvent } from "@/domain/types";
import { initialOnboardingState } from "@/features/onboarding/state";

type Load = { phase: "loading" } | { phase: "ready"; events: LiveEvent[] } | { phase: "error" };

/**
 * Real, stored shows in Bengaluru for the next 2 months (public; anyone's private
 * pasted announcements are excluded server-side). Fictional examples stay below,
 * clearly labelled.
 */
export function LiveCityShows() {
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/events/city?city=bengaluru&days=60", { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json()) as { ok: boolean; data?: { events: LiveEvent[] } };
        if (!r.ok || !body.ok || !body.data) throw new Error("bad response");
        setLoad({ phase: "ready", events: body.data.events });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ phase: "error" });
      });
    return () => controller.abort();
  }, [nonce]);

  return (
    <section aria-labelledby="live-city-title" className="space-y-5">
      <div className="space-y-2 border-b border-line pb-3">
        <p className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-signal-ink uppercase">
          <span aria-hidden className="relative grid size-2.5 place-items-center">
            <span className="absolute inset-0 animate-ping-soft rounded-full bg-urgent/60" />
            <span className="size-2 rounded-full bg-urgent" />
          </span>
          Live · from real sources
        </p>
        <h2 id="live-city-title" className="flex items-center gap-2 font-display text-[1.7rem] leading-tight font-semibold">
          <MapPin aria-hidden className="size-6 shrink-0 text-signal-ink" />
          Live in Bengaluru · next 2 months
        </h2>
        <p className="text-fg-secondary">
          Real shows our sources have found. Each card says where it came from; ticket links appear only when a source gives one.
        </p>
      </div>
      {load.phase === "loading" && <EventGridSkeleton label="Loading live shows in Bengaluru…" />}
      {load.phase === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-fg-secondary">
          <span className="flex-1">Live shows couldn&rsquo;t load right now.</span>
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
          No shows found in Bengaluru for the next 2 months yet. Sources are checked several times a day.
        </p>
      )}
      {load.phase === "ready" && load.events.length > 0 && (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2 xl:grid-cols-3">
          {load.events.map((e) => (
            <li key={e.id}>
              <EventCard event={e} location={initialOnboardingState.location} detailHref={`/radar/events/${e.id}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
