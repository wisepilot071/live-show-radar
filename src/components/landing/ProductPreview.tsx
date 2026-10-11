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
    <section aria-labelledby="preview-title" className="border-y border-line/60 bg-inset/60">
      <Container width="wide" className="grid grid-cols-[minmax(0,1fr)] gap-10 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-center lg:py-24">
        <div className="space-y-5">
          <Eyebrow>Product preview</Eyebrow>
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

        <div className="relative rounded-xl border border-dashed border-line-strong bg-canvas p-3 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1">
            <StatusBadge tone="example" label="Example data · not live" />
            <span className="font-mono text-xs text-fg-muted">Fictional artists &amp; venues</span>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div className="space-y-4">
              <div className="rounded-lg border border-line/70 bg-surface p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Music2 aria-hidden className="size-4 text-signal-ink" /> Your artists
                </p>
                <ul className="flex flex-wrap gap-2">
                  {EXAMPLE_FOLLOWED.map((name) => (
                    <li
                      key={name}
                      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-3 pl-1 text-xs text-fg"
                    >
                      <span aria-hidden className="grid size-6 place-items-center rounded-full bg-inset font-mono text-[0.6rem] text-fg-secondary">
                        {initialsFor(name)}
                      </span>
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-urgent/40 bg-urgent/[0.06] p-4">
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
