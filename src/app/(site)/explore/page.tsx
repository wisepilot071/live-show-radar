import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { EventCard } from "@/components/events/EventCard";
import { Atmosphere } from "@/components/media/Atmosphere";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { LiveCityShows } from "@/components/explore/LiveCityShows";
import { ILLUSTRATIVE_EVENTS } from "@/data/illustrative-events";
import { initialOnboardingState } from "@/features/onboarding/state";

export const metadata: Metadata = { title: "Explore the preview" };

const ANATOMY = [
  { term: "Artist & event", desc: "Who is playing and what kind of show it is." },
  { term: "Venue, city & date", desc: "Shown as the source states them. Unknown dates say so." },
  { term: "Ticket status", desc: "Only what a source states — never a guessed deadline or availability." },
  { term: "Verification", desc: "Confirmed, unconfirmed, stale, pending or not available." },
  { term: "Source", desc: "Where the information came from and when it was last checked." },
  { term: "Next action", desc: "A ticket link only when a real, verified one exists." },
];

export default function ExplorePage() {
  return (
    <>
      <Container width="wide" className="space-y-10 pt-12 pb-16 lg:pt-16">
        <header className="on-ink relative isolate animate-rise space-y-5 overflow-hidden rounded-[1.75rem] bg-ink px-5 pt-16 pb-8 text-on-ink shadow-[0_30px_60px_-35px_rgb(32_40_32/0.6)] sm:px-10 sm:pt-24 sm:pb-10">
          <Atmosphere asset="panorama-band" priority />
          <Eyebrow className="flex items-center gap-2 text-signal">
            <span aria-hidden className="inline-block h-px w-6 bg-signal" />
            Explore before you commit
          </Eyebrow>
          <h1 className="max-w-3xl font-display text-[clamp(2.4rem,6vw,4.25rem)] leading-[0.98] font-extrabold tracking-tight text-balance drop-shadow-[0_2px_18px_rgb(0_0_0/0.35)]">
            Here&rsquo;s how your radar will read.
          </h1>
          <p className="max-w-3xl text-lg leading-relaxed text-on-ink/85">
            Each show gets one card. It tells you what&rsquo;s known, what isn&rsquo;t, and where the details came from —
            so you can decide quickly whether to act.
          </p>
        </header>

        <LiveCityShows />

        <InlineAlert tone="warning" title="These are illustrative examples, not live listings">
          The artists, venues, dates and ticket details below are invented to show every kind of card. None of these
          shows exist — the live shows above come from real sources.
        </InlineAlert>

        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {ILLUSTRATIVE_EVENTS.map((event) => (
            <li key={event.id}>
              <EventCard event={event} location={initialOnboardingState.location} detailHref={`/radar/events/${event.id}`} />
            </li>
          ))}
        </ul>

        <section aria-labelledby="anatomy-title" className="rounded-xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <h2 id="anatomy-title" className="mb-6 font-display text-2xl font-bold tracking-tight">
            What every card tells you
          </h2>
          <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {ANATOMY.map((a) => (
              <div key={a.term} className="space-y-1 border-l-2 border-signal-ink/60 pl-4">
                <dt className="font-semibold text-fg">{a.term}</dt>
                <dd className="text-sm text-fg-secondary">{a.desc}</dd>
              </div>
            ))}
          </dl>
        </section>
      </Container>

      <section aria-labelledby="explore-cta" className="border-t border-line/60 bg-inset/60">
        <Container width="wide" className="flex flex-col gap-6 py-14 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h2 id="explore-cta" className="font-display text-3xl font-bold tracking-tight">
              Ready to make it yours?
            </h2>
            <p className="text-fg-secondary">Pick your artists and cities. Spotify is optional.</p>
          </div>
          <ButtonLink href="/onboarding/artists" size="lg" trailingIcon={<ArrowRight aria-hidden className="size-5" />}>
            Build my music radar
          </ButtonLink>
        </Container>
      </section>
    </>
  );
}
