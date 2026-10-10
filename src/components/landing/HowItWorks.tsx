import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";

const STEPS = [
  {
    title: "Choose your artists",
    body: "Search for the artists you love, import them from Spotify when that's available, or do both.",
  },
  {
    title: "Discover their shows",
    body: "See relevant concerts and festivals across India, with your home city first.",
  },
  {
    title: "Hear when it matters",
    body: "Get told about new announcements, verified ticket windows, and date or venue changes.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="scroll-mt-20">
      <Container width="wide" className="py-16 lg:py-24">
        <div className="mb-10 max-w-2xl space-y-4">
          <Eyebrow>How it works</Eyebrow>
          <h2 id="how-title" className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Three steps. No setup homework.
          </h2>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-4 bg-canvas p-6 sm:p-8">
              <span
                aria-hidden
                className="font-display text-7xl leading-none font-extrabold tracking-tighter text-transparent [-webkit-text-stroke:1.5px_var(--border-strong)]"
              >
                0{i + 1}
              </span>
              <h3 className="font-display text-2xl font-bold tracking-tight">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              <p className="leading-relaxed text-fg-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
}
