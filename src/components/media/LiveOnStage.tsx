"use client";

import { ArrowUpRight, ChevronDown, Clapperboard, Play, RotateCw, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveVideo } from "@/app/api/media/videos/route";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { normalizeArtistName } from "@/domain/artist-identity";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { cn } from "@/lib/cn";
import { Atmosphere } from "./Atmosphere";
import { Equalizer } from "./Equalizer";
import { YouTubePlayer, type Playback } from "./YouTubePlayer";

const INITIAL = 5;

type Load = { phase: "waiting" } | { phase: "ready"; videos: LiveVideo[] } | { phase: "error" };

const PLAYBACK_LABEL: Partial<Record<Playback["kind"], string>> = {
  loading: "Loading…",
  buffering: "Buffering…",
  playing: "Now playing",
  paused: "Paused",
  ended: "Finished",
  blocked: "Waiting for you to press play",
  error: "Can't play here",
};

/**
 * "Live on Stage": curated official live performances, played in order inside
 * the app with ONE embedded YouTube player.
 * - Nothing loads from YouTube until the viewer presses "Start watching" or
 *   picks a performance (no autoplay on page load).
 * - When YouTube reports a video ENDED, the next playable one starts in the
 *   same player. Videos whose owners disabled embedding are skipped by the
 *   queue and link out to YouTube instead.
 * - Followed artists (matched by name) come first and are labelled.
 * - The equaliser animates only while YouTube reports PLAYING.
 * Fully independent of discovery — if this fails, only this section shows an error.
 */
export function LiveOnStage() {
  const { state } = useOnboarding();
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [load, setLoad] = useState<Load>({ phase: "waiting" });
  const [nonce, setNonce] = useState(0);
  const [index, setIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const [playback, setPlayback] = useState<Playback>({ kind: "idle" });
  const [showAll, setShowAll] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    fetch("/api/media/videos", { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as { ok: boolean; data?: { videos: LiveVideo[] } };
        if (!res.ok || !body.ok || !body.data) throw new Error("bad response");
        setLoad({ phase: "ready", videos: body.data.videos });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ phase: "error" });
      });
    return () => controller.abort();
  }, [visible, nonce]);

  const followed = useMemo(() => new Set(state.selections.map((s) => normalizeArtistName(s.artist.name))), [state.selections]);
  const isFollowed = (v: LiveVideo) => followed.has(normalizeArtistName(v.artist));

  const ordered = useMemo(() => {
    if (load.phase !== "ready") return [];
    const f = (v: LiveVideo) => followed.has(normalizeArtistName(v.artist));
    return [...load.videos].sort((a, b) => Number(f(b)) - Number(f(a)));
  }, [load, followed]);
  /** The play queue: only videos the owner lets other sites embed. */
  const queue = useMemo(() => ordered.filter((v) => v.status !== "embedding_disabled"), [ordered]);
  const linkOnly = useMemo(() => ordered.filter((v) => v.status === "embedding_disabled"), [ordered]);
  const followedCount = ordered.filter(isFollowed).length;

  const current = queue[Math.min(index, Math.max(queue.length - 1, 0))];
  const hasNext = index < queue.length - 1;
  const hasPrev = index > 0;

  function playAt(i: number) {
    setFinished(false);
    setIndex(i);
    setStarted(true);
  }
  function next() {
    if (hasNext) playAt(index + 1);
  }

  const shownQueue = showAll ? queue : queue.slice(0, INITIAL);
  const hiddenCount = queue.length - INITIAL;
  const status = started ? PLAYBACK_LABEL[playback.kind] : undefined;

  return (
    <section ref={ref} aria-labelledby="live-on-stage-title" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <h2 id="live-on-stage-title" className="flex items-center gap-2 font-display text-[1.7rem] leading-tight font-semibold">
            <Clapperboard aria-hidden className="size-6 text-signal-ink" />
            Live on Stage
          </h2>
          <p className="text-fg-secondary">Feel the energy. Discover the artists. Find your next show.</p>
        </div>
        {load.phase === "ready" && (
          <p className="text-sm text-fg-muted">
            {followedCount > 0
              ? `${followedCount} from artists you follow · the rest are curated official performances`
              : "Curated official live performances — not personalised to your artists"}
          </p>
        )}
      </div>

      {load.phase === "waiting" && <StageSkeleton />}
      {load.phase === "error" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface p-4 text-sm text-fg-secondary">
          <span className="flex-1">Performance videos couldn&rsquo;t load right now. Everything else on your radar works as normal.</span>
          <Button
            variant="secondary"
            leadingIcon={<RotateCw aria-hidden className="size-4" />}
            onClick={() => {
              setLoad({ phase: "waiting" });
              setNonce((n) => n + 1);
            }}
          >
            Retry
          </Button>
        </div>
      )}
      {load.phase === "ready" && ordered.length === 0 && (
        <p className="rounded-xl border border-line bg-surface p-4 text-sm text-fg-secondary">No performances are available right now.</p>
      )}

      {load.phase === "ready" && current && (
        <div className="on-ink relative isolate overflow-hidden rounded-[1.75rem] bg-ink p-3 text-on-ink shadow-[0_30px_70px_-40px_rgb(32_40_32/0.75)] sm:p-5 lg:p-6">
          <Atmosphere asset="gold-stage" strength="soft" fade="bottom" className="opacity-60" />
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            {/* Featured stage */}
            <div className="min-w-0 space-y-4">
              <YouTubePlayer
                video={{ id: current.id, title: current.title, thumbnailUrl: current.thumbnailUrl }}
                started={started}
                onStart={() => playAt(index)}
                onPlayback={setPlayback}
                onEnded={() => (hasNext ? next() : setFinished(true))}
                onSkip={next}
                hasNext={hasNext}
                startHint={
                  queue.length > 1
                    ? `Plays ${queue.length} performances in order — the next one starts when the current one ends.`
                    : undefined
                }
              />
              <div className="flex flex-wrap items-start justify-between gap-4 px-1">
                <div className="min-w-0 space-y-1.5">
                  <p className="flex min-h-5 items-center gap-2 text-xs font-semibold tracking-[0.12em] text-signal uppercase" aria-live="polite">
                    {started ? (
                      <>
                        <Equalizer active={playback.kind === "playing"} />
                        {status}
                        <span className="text-on-ink/60 normal-case tracking-normal">
                          · {index + 1} of {queue.length}
                        </span>
                      </>
                    ) : (
                      <>Up first · {queue.length} in the queue</>
                    )}
                  </p>
                  <p className="font-display text-2xl leading-tight font-semibold">{current.artist}</p>
                  <p className="line-clamp-2 text-sm text-on-ink/75">{current.title}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-semibold">
                    <span className="rounded-full bg-on-ink/10 px-2.5 py-1 text-on-ink/85">{current.kind}</span>
                    {isFollowed(current) && <span className="rounded-full bg-signal px-2.5 py-1 text-on-signal">You follow {current.artist}</span>}
                    <span className="text-on-ink/60">YouTube · {current.channel}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <IconButton label="Previous performance" disabled={!hasPrev} onClick={() => playAt(index - 1)}>
                    <SkipBack aria-hidden className="size-4" />
                  </IconButton>
                  <IconButton label="Next performance" disabled={!hasNext} onClick={next}>
                    <SkipForward aria-hidden className="size-4" />
                  </IconButton>
                </div>
              </div>
              {finished && (
                <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl bg-on-ink/[0.07] p-3 text-sm">
                  <span className="flex-1">That&rsquo;s the end of the queue.</span>
                  <Button variant="onInk" leadingIcon={<RotateCw aria-hidden className="size-4" />} onClick={() => playAt(0)}>
                    Watch again from the start
                  </Button>
                </div>
              )}
            </div>

            {/* Queue */}
            <div className="min-w-0 space-y-3">
              <p className="px-1 text-xs font-semibold tracking-[0.12em] text-on-ink/70 uppercase">Queue</p>
              <ol className="space-y-1.5 lg:max-h-[30rem] lg:overflow-y-auto lg:pr-1 [scrollbar-color:rgb(247_244_236/0.25)_transparent] [scrollbar-width:thin]">
                {shownQueue.map((v) => {
                  const i = queue.indexOf(v);
                  const isCurrent = i === index;
                  const playingHere = isCurrent && started && playback.kind === "playing";
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => playAt(i)}
                        aria-current={isCurrent ? "true" : undefined}
                        aria-label={`${isCurrent && started ? "Now selected" : "Watch performance"}: ${v.artist} — ${v.title}`}
                        className={cn(
                          "group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors duration-[var(--duration-fast)]",
                          isCurrent ? "bg-on-ink/[0.12] ring-1 ring-signal/50" : "hover:bg-on-ink/[0.07]",
                        )}
                      >
                        <span className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-on-ink/10 sm:w-32">
                          {/* eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail, lazy */}
                          <img src={v.thumbnailUrl} alt="" width={320} height={180} loading="lazy" decoding="async" className="size-full object-cover" />
                          <span className="absolute inset-0 grid place-items-center bg-ink/35 opacity-100 transition-opacity group-hover:bg-ink/20">
                            {playingHere ? (
                              <span className="grid size-8 place-items-center rounded-full bg-ink/80">
                                <Equalizer active />
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "grid size-8 place-items-center rounded-full transition-transform group-hover:scale-110",
                                  isCurrent ? "bg-signal text-on-signal" : "bg-on-ink/90 text-ink",
                                )}
                              >
                                <Play aria-hidden className="size-3.5 translate-x-px fill-current" />
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="min-w-0 flex-1 space-y-0.5">
                          <span className="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-wide text-on-ink/60 uppercase">
                            <span className="tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                            {isCurrent && started ? <span className="text-signal">· {status}</span> : isFollowed(v) ? <span className="text-signal">· You follow</span> : null}
                          </span>
                          <span className="block truncate font-semibold">{v.artist}</span>
                          <span className="line-clamp-1 text-xs text-on-ink/65">{v.title}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              {hiddenCount > 0 && (
                <Button
                  variant="onInk"
                  className="w-full"
                  onClick={() => setShowAll((s) => !s)}
                  aria-expanded={showAll}
                  trailingIcon={<ChevronDown aria-hidden className={showAll ? "size-4 rotate-180" : "size-4"} />}
                >
                  {showAll ? "Show fewer" : `View more performances (${hiddenCount})`}
                </Button>
              )}
              {linkOnly.length > 0 && (
                <div className="space-y-1.5 border-t border-on-ink/10 pt-3">
                  <p className="px-1 text-xs text-on-ink/60">Only on YouTube (the owner turned off embedding):</p>
                  {linkOnly.map((v) => (
                    <a
                      key={v.id}
                      href={`https://www.youtube.com/watch?v=${v.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 text-sm hover:bg-on-ink/[0.07]"
                    >
                      <span className="truncate">
                        <span className="font-semibold">{v.artist}</span> <span className="text-on-ink/65">· {v.title}</span>
                      </span>
                      <ArrowUpRight aria-hidden className="size-4 shrink-0" />
                      <span className="sr-only">(opens YouTube in a new tab)</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-11 place-items-center rounded-full border border-on-ink/25 text-on-ink transition-colors hover:border-on-ink hover:bg-on-ink/10 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

/** Same shape as the loaded stage, so nothing jumps when it arrives. */
function StageSkeleton() {
  return (
    <div role="status" aria-label="Loading performances…" className="rounded-[1.75rem] bg-ink p-3 sm:p-5 lg:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Skeleton tone="ink" className="aspect-video w-full rounded-xl" />
          <Skeleton tone="ink" className="h-4 w-32" />
          <Skeleton tone="ink" className="h-7 w-56" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 p-2">
              <Skeleton tone="ink" className="aspect-video w-28 rounded-lg sm:w-32" />
              <div className="flex-1 space-y-2">
                <Skeleton tone="ink" className="h-3 w-12" />
                <Skeleton tone="ink" className="h-4 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading performances…</span>
    </div>
  );
}
