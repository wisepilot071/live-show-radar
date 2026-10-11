import { BellRing, Music2 } from "lucide-react";
import { EventCard } from "@/components/events/EventCard";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ILLUSTRATIVE_EVENTS } from "@/data/illustrative-events";
import { initialsFor } from "@/domain/artist-identity";

// Fictional names, matching the illustrative events.
const EXAMPLE_FOLLOWED = ["Northbound Saints", "Lowtide Radio", "Kite Season", "Paper Monsoon", "Saffron Static"];

export function ProductPreview() {
  const featured = ILLUSTRATIVE_EVENTS[0];
  return (
    <section aria-labelledby="preview-title" className="offscreen-lazy relative isolate overflow-hidden bg-canvas">
      {/* Warm after-sunset glow: marigold and coral washes over the canvas */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-[#f3d7b6] to-transparent" />
        <div className="absolute -top-32 left-[10%] size-[36rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_198_92/0.35),transparent)] blur-2xl" />
        <div className="absolute right-[-10%] bottom-[-20%] size-[40rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_122_89/0.22),transparent)] blur-2xl [animation-delay:-13s]" />
        <div className="absolute top-1/3 right-1/3 size-[22rem] rounded-full bg-[radial-gradient(closest-side,rgb(169_139_255/0.16),transparent)] blur-2xl [animation-delay:-7s]" />
      </div>
      <Container width="wide" className="grid grid-cols-[minmax(0,1fr)] gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-center lg:py-24">
        <div className="space-y-5">
          <Eyebrow className="text-[#b5531f]">Product preview</Eyebrow>
          <h2 id="preview-title" className="font-display text-4xl leading-[1.02] font-bold tracking-tight text-balance sm:text-5xl">
            One place for every show that matters to you.
          </h2>
          <p className="max-w-lg leading-relaxed text-fg-secondary">
            Your artists, the shows they announce, what&rsquo;s actually known about tickets, and a nudge when something
            changes. Every card says where its information came from and how fresh it is.
          </p>
          <ButtonLink href="/explore" variant="secondary">
            See the full preview
          </ButtonLink>
        </div>

        <div className="relative rotate-0 rounded-[1.75rem] border border-dashed border-line-strong bg-surface/60 p-3 shadow-[0_40px_80px_-40px_rgb(120_60_20/0.45)] transition-transform duration-700 ease-[var(--ease-out-soft)] hover:-rotate-[0.6deg] motion-reduce:hover:rotate-0 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1">
            <StatusBadge tone="example" label="Example data · not live" />
            <span className="font-mono text-xs text-fg-muted">Fictional artists &amp; venues</span>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-4">
              <div className="rounded-2xl border border-line/70 bg-surface p-4 shadow-card">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Music2 aria-hidden className="size-4 text-signal-ink" /> Your artists
                </p>
                <ul className="flex flex-wrap gap-2">
                  {EXAMPLE_FOLLOWED.map((name) => (
                    <li
                      key={name}
                      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-3 pl-1 text-xs text-fg"
                    >
                      <span aria-hidden className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-marigold to-sunset font-mono text-[0.6rem] font-bold text-ink">
                        {initialsFor(name)}
                      </span>
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-urgent/40 bg-gradient-to-br from-urgent/[0.10] to-marigold/[0.10] p-4 shadow-card">
                <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-fg">
                  <BellRing aria-hidden className="size-4 text-urgent-ink" /> Example alert
                </p>
                <p className="text-sm text-fg-secondary">
                  Early-bird tickets for Northbound Saints in Bengaluru close on 9 Nov. Confirmed by the listing source.
                </p>
              </div>
            </div>
            {featured && <EventCard event={featured} />}
          </div>
        </div>
      </Container>
    </section>
  );
}
