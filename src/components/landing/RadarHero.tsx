import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { RadarVisual } from "./RadarVisual";

export function RadarHero() {
  return (
    <section aria-labelledby="hero-title" className="grain relative overflow-hidden">
      {/* Soft lime haze behind the radar; one light source, not a neon wash. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-[-20%] size-[42rem] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(closest-side, rgb(164 255 91 / 0.18), transparent)" }}
      />
      <Container width="wide" className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-12 pt-14 pb-16 sm:pt-20 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16 lg:pt-24 lg:pb-28">
        <div className="animate-rise space-y-7">
          <Eyebrow>
            <span className="text-signal">●</span> For people who live for live music
          </Eyebrow>
          <h1
            id="hero-title"
            className="font-display text-[clamp(2.6rem,7.4vw,5.6rem)] lg:text-[clamp(3.5rem,6vw,5.6rem)] leading-[0.92] font-extrabold tracking-[-0.035em] text-balance text-fg"
          >
            Your artists.
            <br />
            <span className="text-fg-secondary">Your next</span>{" "}
            <span className="relative inline-block">
              unforgettable
              <svg
                aria-hidden
                viewBox="0 0 300 12"
                preserveAspectRatio="none"
                className="absolute -bottom-1 left-0 h-2.5 w-full text-signal sm:-bottom-2"
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
            <ButtonLink href="/onboarding" size="lg" trailingIcon={<ArrowRight aria-hidden className="size-5" />}>
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
