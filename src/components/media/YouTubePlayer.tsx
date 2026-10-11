"use client";

import { ArrowUpRight, Play, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/* Minimal typing for the official YouTube IFrame Player API. */
interface YTPlayer {
  destroy(): void;
  getIframe(): HTMLIFrameElement;
}
interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: (e: { target: YTPlayer }) => void; onError?: (e: { data: number }) => void };
    },
  ) => YTPlayer;
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads https://www.youtube.com/iframe_api once, only when someone presses play. */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (!apiPromise) {
    apiPromise = new Promise<YTNamespace>((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (window.YT) resolve(window.YT);
      };
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.async = true;
      s.onerror = () => {
        apiPromise = null;
        reject(new Error("YouTube player script couldn't load"));
      };
      document.head.appendChild(s);
      setTimeout(() => reject(new Error("YouTube player timed out")), 15000);
    });
  }
  return apiPromise;
}

/** YouTube's documented onError codes. */
function errorMessage(code: number | "load"): string {
  if (code === 101 || code === 150 || code === 153) return "The owner doesn't allow this video to be played on other sites.";
  if (code === 100) return "This video is no longer available (removed or private).";
  if (code === 2) return "This video link isn't valid.";
  if (code === 5) return "Your browser couldn't play this video.";
  if (code === "load") return "The YouTube player didn't load — the video may be unavailable, or YouTube may be blocked on this network.";
  return "This video can't be played here right now.";
}

type Phase = { kind: "idle" } | { kind: "loading" } | { kind: "playing" } | { kind: "error"; code: number | "load" };

/**
 * Click-to-play YouTube embed ("lite" pattern):
 * - shows only the real thumbnail until the user presses play — no iframe, no
 *   YouTube script, nothing auto-plays
 * - on press, loads the official IFrame API and plays via youtube-nocookie.com
 * - embedding-disabled / removed / blocked videos show a fallback with a link
 *   to watch on YouTube
 */
export function YouTubePlayer({
  videoId,
  title,
  thumbnailUrl,
  active,
  onActivate,
  embeddable = true,
}: {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  /** Only one player is mounted at a time; others go back to their thumbnail. */
  active: boolean;
  onActivate: () => void;
  embeddable?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [thumbFailed, setThumbFailed] = useState(false);
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const current: Phase = active ? phase : { kind: "idle" };

  useEffect(() => {
    if (!active || !host.current) return;
    let cancelled = false;
    let ready = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const mount = document.createElement("div");
    host.current.appendChild(mount);
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        player.current = new YT.Player(mount, {
          videoId,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          // autoplay only after the user's own click on "Watch performance".
          playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
          events: {
            onReady: (e) => {
              ready = true;
              e.target.getIframe().title = `${title} — YouTube video player`;
            },
            onError: (e) => {
              if (!cancelled) setPhase({ kind: "error", code: e.data });
            },
          },
        });
        // Reveal the player right away so YouTube's own messages (e.g. "Video
        // unavailable") are visible; our fallback covers the cases it can't.
        setPhase({ kind: "playing" });
        // Some unavailable videos never report ready or error: fall back after a while.
        watchdog = setTimeout(() => {
          if (!cancelled && !ready) setPhase({ kind: "error", code: "load" });
        }, 15000);
      })
      .catch(() => {
        if (!cancelled) setPhase({ kind: "error", code: "load" });
      });
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      player.current?.destroy();
      player.current = null;
      mount.remove();
    };
  }, [active, videoId, title]);

  function start() {
    setPhase({ kind: "loading" });
    onActivate();
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-ink">
      {/* Player mount point (only filled while active) */}
      <div ref={host} className={cn("absolute inset-0 [&>div]:h-full [&>iframe]:h-full [&>iframe]:w-full", current.kind === "error" && "hidden")} />

      {(current.kind === "idle" || current.kind === "loading") && (
        <div className="absolute inset-0">
          {!thumbFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail; fixed 16:9 box, lazy-loaded
            <img
              src={thumbnailUrl}
              alt=""
              width={480}
              height={360}
              loading="lazy"
              decoding="async"
              onError={() => setThumbFailed(true)}
              className="size-full object-cover"
            />
          ) : (
            <div aria-hidden className="size-full bg-[radial-gradient(circle_at_30%_30%,rgb(200_241_105/0.25),transparent_60%)]" />
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/10 to-transparent" />
          {embeddable ? (
            <button
              type="button"
              onClick={start}
              disabled={current.kind === "loading"}
              className="on-ink group absolute inset-0 grid place-items-center"
              aria-label={`Watch performance: ${title}`}
            >
              <span className="flex items-center gap-2 rounded-full bg-signal px-4 py-2.5 text-sm font-semibold text-on-signal shadow-raised transition-transform group-hover:scale-105">
                {current.kind === "loading" ? (
                  <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                ) : (
                  <Play aria-hidden className="size-4 fill-current" />
                )}
                {current.kind === "loading" ? "Loading player…" : "Watch performance"}
              </span>
            </button>
          ) : (
            <a
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="on-ink absolute inset-0 grid place-items-center"
            >
              <span className="flex items-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold text-fg">
                Watch on YouTube <ArrowUpRight aria-hidden className="size-4" />
                <span className="sr-only">(embedding is turned off for this video; opens in a new tab)</span>
              </span>
            </a>
          )}
        </div>
      )}

      {current.kind === "loading" && (
        <p role="status" className="sr-only">
          Loading the YouTube player…
        </p>
      )}

      {current.kind === "error" && (
        <div role="alert" className="on-ink absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-on-ink">
          <VideoOff aria-hidden className="size-6 text-on-ink/70" />
          <p className="max-w-xs text-sm">{errorMessage(current.code)}</p>
          <a
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-on-ink/40 px-4 text-sm font-semibold hover:bg-on-ink/10"
          >
            Watch on YouTube <ArrowUpRight aria-hidden className="size-4" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      )}
    </div>
  );
}
