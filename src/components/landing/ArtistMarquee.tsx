import { ARTIST_PHOTOS } from "@/data/artist-photos";
import { CURATED_ARTISTS } from "@/data/curated-artists";
import { Container } from "@/components/ui/Container";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";

/*
 * Two ribbons of real artists from the Live Show Radar catalogue (the ones you
 * can follow in one tap), drifting in opposite directions. Photos are the
 * artists' licensed Wikimedia Commons images; credits are listed below.
 * Hover/focus pauses a row; reduced motion stops it.
 */
const WITH_PHOTOS = CURATED_ARTISTS.filter((a) => ARTIST_PHOTOS[a.slug]);
const ROWS = [WITH_PHOTOS.filter((_, i) => i % 2 === 0), WITH_PHOTOS.filter((_, i) => i % 2 === 1)];
const RING = ["ring-marigold/60", "ring-sunset/60", "ring-signal/60", "ring-violet/60", "ring-rose/60"];

function Row({ artists, reverse }: { artists: typeof WITH_PHOTOS; reverse?: boolean }) {
  const item = (a: (typeof WITH_PHOTOS)[number], i: number, hidden: boolean) => (
    <li
      key={`${hidden ? "b" : "a"}-${a.slug}`}
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center gap-3 rounded-full border border-on-ink/10 bg-on-ink/[0.06] py-1.5 pr-5 pl-1.5 backdrop-blur-sm"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- self-hosted 320px artist photo */}
      <img
        src={ARTIST_PHOTOS[a.slug]!.src}
        alt=""
        width={48}
        height={48}
        loading="lazy"
        decoding="async"
        className={cn("size-12 rounded-full object-cover object-[50%_25%] ring-2", RING[i % RING.length])}
      />
      <span className="text-sm font-semibold whitespace-nowrap text-on-ink">{a.name}</span>
      <span className="text-xs whitespace-nowrap text-on-ink/50">{a.category === "indian" ? "India" : "International"}</span>
    </li>
  );
  return (
    <div className="marquee-row overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_8%,black_92%,transparent)]">
      <ul className={cn("flex w-max gap-3", reverse ? "animate-marquee-reverse" : "animate-marquee")}>
        {artists.map((a, i) => item(a, i, false))}
        {/* Second copy makes the loop seamless; hidden from screen readers. */}
        {artists.map((a, i) => item(a, i, true))}
      </ul>
    </div>
  );
}

export function ArtistMarquee() {
  return (
    <section aria-labelledby="marquee-title" className="on-ink relative isolate overflow-hidden bg-dusk-900 pt-4 pb-24 text-on-ink">
      <Container width="wide" className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Eyebrow className="text-marigold">On the radar</Eyebrow>
          <h2 id="marquee-title" className="font-display text-2xl font-semibold sm:text-3xl">
            {CURATED_ARTISTS.length} artists you can follow in one tap
          </h2>
        </div>
        <p className="max-w-sm text-sm text-on-ink/60">From Arijit Singh to Coldplay — or search everyone on MusicBrainz.</p>
      </Container>
      <div className="space-y-3">
        <Row artists={ROWS[0]!} />
        <Row artists={ROWS[1]!} reverse />
      </div>
      <Container width="wide" className="mt-6">
        <details className="text-xs text-on-ink/55">
          <summary className="inline-flex min-h-11 cursor-pointer items-center hover:text-on-ink/80">Artist photo credits</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {WITH_PHOTOS.map((a) => {
              const p = ARTIST_PHOTOS[a.slug]!;
              return (
                <li key={a.slug}>
                  {a.name} —{" "}
                  <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-on-ink">
                    {p.author}
                  </a>
                  , {p.licence}, Wikimedia Commons
                </li>
              );
            })}
          </ul>
        </details>
      </Container>
      {/* Horizon: night fades through a sunset band into the warm canvas below */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent via-[#6b3346]/70 to-[#f3d7b6]" />
    </section>
  );
}
