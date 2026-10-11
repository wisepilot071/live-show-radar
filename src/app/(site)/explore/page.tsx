import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { EventCard } from "@/components/events/EventCard";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { InlineAlert } from "@/components/ui/InlineAlert";
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
        <header className="max-w-3xl space-y-5">
          <Eyebrow>Explore before you commit</Eyebrow>
          <h1 className="font-display text-[clamp(2.4rem,6vw,4.25rem)] leading-[0.98] font-extrabold tracking-tight text-balance">
            Here&rsquo;s how your radar will read.
          </h1>
          <p className="text-lg leading-relaxed text-fg-secondary">
            Each show gets one card. It tells you what&rsquo;s known, what isn&rsquo;t, and where the details came from —
            so you can decide quickly whether to act.
          </p>
        </header>

        <InlineAlert tone="warning" title="These are illustrative examples, not live listings">
          The artists, venues, dates and ticket details below are invented to show the layout. Live event discovery
          isn&rsquo;t connected yet, so nothing here is being monitored and none of these shows exist.
        </InlineAlert>

        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {ILLUSTRATIVE_EVENTS.map((event) => (
            <li key={event.id}>
              <EventCard event={event} location={initialOnboardingState.location} detailHref={`/radar/events/${event.id}`} />
            </li>
          ))}
        </ul>

        <section aria-labelledby="anatomy-title" className="rounded-lg border border-line bg-surface p-6 sm:p-8">
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
