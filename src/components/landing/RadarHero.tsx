import { ArrowRight } from "lucide-react";
import { Atmosphere } from "@/components/media/Atmosphere";
import { CrowdLights } from "@/components/media/CrowdLights";
import { DoodleArt, NightSky } from "@/components/media/NightSky";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { RadarVisual } from "./RadarVisual";

/**
 * Landing hero — "golden hour": an open-air festival at dusk (decorative photo,
 * plum-toned), stars coming out, a crowd of wristband lights along the bottom,
 * and the radar glowing on the right. Copy is unchanged.
 */
export function RadarHero() {
  return (
    <section aria-labelledby="hero-title" className="on-ink relative isolate overflow-hidden bg-dusk-900 text-on-ink">
      <Atmosphere asset="festival-sunset" tone="dusk" priority />
      <NightSky dense className="opacity-80" />
      <CrowdLights className="h-28 sm:h-36" />
      {/* Sunset glow behind the headline */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-40 -z-10 size-[42rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_122_89/0.28),transparent)] blur-2xl"
      />

      <Container
        width="wide"
        className="relative grid grid-cols-[minmax(0,1fr)] items-center gap-12 pt-14 pb-36 sm:pt-20 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-16 lg:pt-24 lg:pb-44"
      >
        <div className="animate-rise space-y-7">
          <Eyebrow className="text-marigold">
            <span className="text-signal">●</span> For people who live for live music
          </Eyebrow>
          <h1
            id="hero-title"
            className="font-display text-[clamp(2.5rem,7vw,5.2rem)] leading-[0.98] font-semibold tracking-[-0.03em] text-balance text-on-ink drop-shadow-[0_4px_30px_rgb(0_0_0/0.35)] lg:text-[clamp(3.3rem,5.6vw,5.2rem)]"
          >
            Your artists.
            <br />
            <span className="text-on-ink/65">Your next</span>{" "}
            <span className="relative inline-block bg-gradient-to-r from-marigold via-sunset to-rose bg-clip-text pr-1 text-transparent italic">
              unforgettable
              <svg
                aria-hidden
                viewBox="0 0 300 12"
                preserveAspectRatio="none"
                className="absolute -bottom-1 left-0 h-2.5 w-full text-signal sm:-bottom-2"
              >
                <path
                  d="M2 8 C 60 2, 120 11, 180 5 S 270 3, 298 7"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  pathLength={1}
                  className="animate-draw [stroke-dasharray:1] [animation-delay:600ms] [animation-duration:1.2s]"
                />
              </svg>
            </span>{" "}
            night.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-on-ink/80">
            Find the shows you would hate to miss. See when the artists you love announce concerts in India, and know
            when a ticket window is worth acting on.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <ButtonLink
              href="/onboarding/artists"
              size="lg"
              className="shadow-[0_12px_40px_-10px_rgb(200_241_105/0.65)]"
              trailingIcon={<ArrowRight aria-hidden className="size-5" />}
            >
              Build my music radar
            </ButtonLink>
            <ButtonLink href="/explore" size="lg" variant="onInk">
              Explore first
            </ButtonLink>
          </div>
          <p className="text-sm text-on-ink/65">Explore first — no Spotify connection or sign-up required.</p>
        </div>

        <div className="relative mx-auto w-full max-w-[26rem] lg:max-w-none">
          {/* Halo + expanding signal rings around the (unchanged) radar */}
          <div aria-hidden className="absolute -inset-10 -z-10 animate-halo rounded-full bg-[radial-gradient(closest-side,rgb(200_241_105/0.28),rgb(255_198_92/0.12)_55%,transparent)] blur-2xl" />
          <div aria-hidden className="absolute -inset-4 -z-10 animate-ping-soft rounded-full border border-signal/30 [animation-duration:4s]" />
          <RadarVisual className="[&>div]:border-dusk-700 [&>div]:bg-dusk-800 [&>div]:shadow-[0_40px_90px_-30px_rgb(0_0_0/0.8),0_0_0_1px_rgb(255_198_92/0.25)]" />
          <DoodleArt doodle="mic" className="absolute -top-6 -left-4 hidden h-20 w-20 animate-float sm:block" />
          <DoodleArt doodle="ticket" className="absolute -right-4 -bottom-8 hidden h-20 w-20 animate-float [animation-delay:-3s] sm:block" />
        </div>
      </Container>
    </section>
  );
}
