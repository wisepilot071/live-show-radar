import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { RadarVisual } from "./RadarVisual";

export function RadarHero() {
  return (
    <section aria-labelledby="hero-title" className="grain relative overflow-hidden">
      <Container width="wide" className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-12 pt-12 pb-14 sm:pt-16 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16 lg:pt-20 lg:pb-20">
        <div className="animate-rise space-y-7">
          <Eyebrow>
            <span className="text-signal-ink">●</span> For people who live for live music
          </Eyebrow>
          <h1
            id="hero-title"
            className="font-display text-[clamp(2.5rem,7vw,5.2rem)] lg:text-[clamp(3.3rem,5.6vw,5.2rem)] leading-[0.98] font-semibold tracking-[-0.03em] text-balance text-fg"
          >
            Your artists.
            <br />
            <span className="text-fg-secondary">Your next</span>{" "}
            <span className="relative inline-block italic">
              unforgettable
              <svg
                aria-hidden
                viewBox="0 0 300 12"
                preserveAspectRatio="none"
                className="absolute -bottom-1 left-0 h-2.5 w-full text-signal-ink sm:-bottom-2"
              >
                <path d="M2 8 C 60 2, 120 11, 180 5 S 270 3, 298 7" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
              </svg>
            </span>{" "}
            night.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-fg-secondary">
            Find the shows you would hate to miss. See when the artists you love announce concerts in India, and know
            when a ticket window is worth acting on.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink href="/onboarding/artists" size="lg" trailingIcon={<ArrowRight aria-hidden className="size-5" />}>
              Build my music radar
            </ButtonLink>
            <ButtonLink href="/explore" size="lg" variant="secondary">
              Explore first
            </ButtonLink>
          </div>
          <p className="text-sm text-fg-muted">Explore first — no Spotify connection or sign-up required.</p>
        </div>

        <div className="mx-auto w-full max-w-[26rem] lg:max-w-none">
          <RadarVisual />
        </div>
      </Container>
    </section>
  );
}
