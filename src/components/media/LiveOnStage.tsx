"use client";

import { ChevronDown, Clapperboard } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { LiveVideo } from "@/app/api/media/videos/route";
import { Button } from "@/components/ui/Button";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { normalizeArtistName } from "@/domain/artist-identity";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { YouTubePlayer } from "./YouTubePlayer";

const INITIAL = 3;

type Load = { phase: "waiting" } | { phase: "ready"; videos: LiveVideo[] } | { phase: "error" };

/**
 * "Live on Stage": curated official live performances, played inside the app
 * with YouTube's embedded player. Videos of artists the user follows (matched
 * by name) are shown first and labelled; everything else is labelled as a
 * curated pick. Lazy: the list is only requested when the section nears the
 * viewport, and no player loads until someone presses play. Fully independent
 * of discovery — if this fails, only this section shows an error.
 */
export function LiveOnStage() {
  const { state } = useOnboarding();
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [load, setLoad] = useState<Load>({ phase: "waiting" });
  const [active, setActive] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

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
  }, [visible]);

  const followed = useMemo(
    () => new Set(state.selections.map((s) => normalizeArtistName(s.artist.name))),
    [state.selections],
  );

  const ordered = useMemo(() => {
    if (load.phase !== "ready") return [];
    const isFollowed = (v: LiveVideo) => followed.has(normalizeArtistName(v.artist));
    return [...load.videos].sort((a, b) => Number(isFollowed(b)) - Number(isFollowed(a)));
  }, [load, followed]);
  const followedCount = ordered.filter((v) => followed.has(normalizeArtistName(v.artist))).length;
  const shown = showAll ? ordered : ordered.slice(0, INITIAL);

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

      {load.phase === "waiting" && <LoadingIndicator label="Loading performances…" className="min-h-24" />}
      {load.phase === "error" && (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm text-fg-secondary">
          Performance videos couldn&rsquo;t load right now. Everything else on your radar works as normal.
        </p>
      )}
      {load.phase === "ready" && ordered.length === 0 && (
        <p className="rounded-lg border border-line bg-surface p-4 text-sm text-fg-secondary">No performances are available right now.</p>
      )}

      {load.phase === "ready" && ordered.length > 0 && (
        <>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((v) => {
              const isFollowed = followed.has(normalizeArtistName(v.artist));
              return (
                <li key={v.id}>
                  <article aria-labelledby={`video-${v.id}`} className="flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface">
                    <YouTubePlayer
                      videoId={v.id}
                      title={v.title}
                      thumbnailUrl={v.thumbnailUrl}
                      embeddable={v.status !== "embedding_disabled"}
                      active={active === v.id}
                      onActivate={() => setActive(v.id)}
                    />
                    <div className="flex flex-1 flex-col gap-2 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-fg-secondary">{v.kind}</span>
                        {isFollowed && (
                          <span className="rounded-full bg-signal px-2.5 py-1 text-on-signal">You follow {v.artist}</span>
                        )}
                      </div>
                      <p className="font-display text-lg leading-snug font-semibold">{v.artist}</p>
                      <h3 id={`video-${v.id}`} className="line-clamp-2 text-sm text-fg-secondary">
                        {v.title}
                      </h3>
                      <p className="mt-auto pt-1 text-xs text-fg-muted">YouTube · {v.channel}</p>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
          {ordered.length > INITIAL && (
            <Button
              variant="secondary"
              onClick={() => setShowAll((s) => !s)}
              aria-expanded={showAll}
              trailingIcon={<ChevronDown aria-hidden className={showAll ? "size-4 rotate-180" : "size-4"} />}
            >
              {showAll ? "Show fewer" : `View more performances (${ordered.length - INITIAL})`}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
