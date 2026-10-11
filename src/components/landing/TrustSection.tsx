import { ShieldCheck } from "lucide-react";
import { VERIFICATION_EXPLAINER, VERIFICATION_TONE } from "@/components/events/event-labels";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { VerificationState } from "@/domain/types";

const STATES: VerificationState[] = ["confirmed", "unconfirmed", "stale", "pending", "unavailable"];

const PROMISES = [
  "We use supported event sources and show which one each detail came from.",
  "Ticket deadlines and availability appear only when a source states them.",
  "Coverage depends on those sources — we'll tell you where it's incomplete.",
  "We never claim an alert was sent unless it actually was.",
];

export function TrustSection() {
  return (
    <section id="transparency" aria-labelledby="trust-title" className="relative isolate scroll-mt-20 overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute -right-40 top-10 -z-10 size-[34rem] rounded-full bg-[radial-gradient(closest-side,rgb(200_241_105/0.25),transparent)] blur-2xl" />
      <Container width="wide" className="grid gap-12 py-16 lg:grid-cols-2 lg:py-24">
        <div className="space-y-5">
          <Eyebrow className="text-signal-ink">Transparency</Eyebrow>
          <h2 id="trust-title" className="font-display text-4xl font-bold tracking-tight text-balance sm:text-5xl">
            Labelled by what we actually know.
          </h2>
          <ul className="space-y-3">
            {PROMISES.map((p) => (
              <li key={p} className="flex gap-3 text-fg-secondary">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-signal/40 ring-1 ring-signal-ink/20">
                  <ShieldCheck aria-hidden className="size-4 text-signal-ink" />
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
        <dl className="divide-y divide-line/60 self-center rounded-[1.75rem] border border-line bg-surface/85 shadow-[0_40px_80px_-45px_rgb(32_40_32/0.45)] backdrop-blur-md">
          {STATES.map((s) => (
            <div key={s} className="grid gap-2 p-4 sm:grid-cols-[9.5rem_1fr] sm:items-center sm:gap-4 sm:p-5">
              <dt>
                <StatusBadge tone={VERIFICATION_TONE[s]} />
              </dt>
              <dd className="text-sm text-fg-secondary">{VERIFICATION_EXPLAINER[s]}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
