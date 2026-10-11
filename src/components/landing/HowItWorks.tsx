import { CrowdLights } from "@/components/media/CrowdLights";
import { DoodleArt, NightSky, type Doodle } from "@/components/media/NightSky";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/cn";

const STEPS: ReadonlyArray<{
  title: string;
  body: string;
  doodle: Doodle;
  accent: string;
  glow: string;
  stroke: string;
}> = [
  {
    title: "Choose your artists",
    body: "Search for the artists you love, import them from Spotify when that's available, or do both.",
    doodle: "guitar",
    accent: "hover:ring-signal/60",
    glow: "bg-signal/25",
    stroke: "[-webkit-text-stroke:1.5px_#c8f169]",
  },
  {
    title: "Discover their shows",
    body: "See relevant concerts and festivals across India, with your home city first.",
    doodle: "compass",
    accent: "hover:ring-marigold/60",
    glow: "bg-marigold/25",
    stroke: "[-webkit-text-stroke:1.5px_#ffc65c]",
  },
  {
    title: "Hear when it matters",
    body: "Get told about new announcements, verified ticket windows, and date or venue changes.",
    doodle: "bell",
    accent: "hover:ring-sunset/60",
    glow: "bg-sunset/25",
    stroke: "[-webkit-text-stroke:1.5px_#ff7a59]",
  },
];

/** Stage spotlights: soft beams swinging from the rig (decorative; frozen under reduced motion). */
const BEAMS = [
  { left: "8%", color: "rgb(169 139 255 / 0.30)", dur: "9s", delay: "0s" },
  { left: "30%", color: "rgb(255 198 92 / 0.26)", dur: "11s", delay: "-4s" },
  { left: "55%", color: "rgb(200 241 105 / 0.22)", dur: "8s", delay: "-2s" },
  { left: "78%", color: "rgb(255 127 200 / 0.26)", dur: "12s", delay: "-6s" },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="offscreen-lazy on-ink relative isolate scroll-mt-20 overflow-hidden bg-dusk-950 text-on-ink"
    >
      {/* Light show */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-2 bg-gradient-to-r from-violet/0 via-marigold/50 to-rose/0 blur-sm" />
        {BEAMS.map((b) => (
          <div
            key={b.left}
            className="absolute -top-[10%] h-[130%] w-[22rem] origin-top animate-beam will-change-transform"
            style={{
              left: b.left,
              background: `linear-gradient(180deg, ${b.color}, transparent 75%)`,
              clipPath: "polygon(47% 0, 53% 0, 100% 100%, 0 100%)",
              animationDuration: b.dur,
              animationDelay: b.delay,
            }}
          />
        ))}
        {/* Haze where the beams land */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-[radial-gradient(ellipse_at_50%_100%,rgb(169_139_255/0.22),transparent_65%)]" />
      </div>
      <NightSky dense className="opacity-70" />
      <CrowdLights className="h-32 sm:h-44" />

      <Container width="wide" className="py-20 pb-44 lg:py-28 lg:pb-56">
        <div className="mb-12 max-w-2xl space-y-4">
          <Eyebrow className="text-marigold">How it works</Eyebrow>
          <h2
            id="how-title"
            className="font-display text-4xl font-bold tracking-tight sm:text-5xl"
          >
            Three steps. No setup homework.
          </h2>
        </div>
        <Reveal as="ol" className="relative grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="reveal"
              style={{ animationDelay: `${i * 150}ms` }}
            >
              <div
                className={cn(
                  "group relative flex h-full flex-col gap-4 overflow-hidden rounded-3xl bg-on-ink/[0.05] p-6 ring-1 ring-on-ink/10 transition-[transform,box-shadow] duration-[var(--duration-base)] hover:-translate-y-1 motion-reduce:hover:translate-y-0 sm:p-8",
                  step.accent,
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute -top-16 -right-16 size-40 rounded-full blur-3xl transition-opacity group-hover:opacity-100",
                    step.glow,
                    "opacity-60",
                  )}
                />
                <div className="flex items-start justify-between gap-4">
                  <span
                    aria-hidden
                    className={cn(
                      "font-display text-7xl leading-none font-extrabold tracking-tighter text-transparent",
                      step.stroke,
                    )}
                  >
                    0{i + 1}
                  </span>
                  <DoodleArt
                    doodle={step.doodle}
                    className="h-20 w-20 animate-float"
                  />
                </div>
                <h3 className="font-display text-2xl font-bold tracking-tight">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="leading-relaxed text-on-ink/75">{step.body}</p>
              </div>
            </li>
          ))}
        </Reveal>
      </Container>
    </section>
  );
}
