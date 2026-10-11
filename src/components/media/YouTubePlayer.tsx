"use client";

import { ArrowUpRight, Play, SkipForward, VideoOff, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/* Minimal typing for the official YouTube IFrame Player API. */
interface YTPlayer {
  destroy(): void;
  getIframe(): HTMLIFrameElement;
  loadVideoById(id: string): void;
  playVideo(): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
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
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
        onStateChange?: (e: { data: number }) => void;
      };
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

/** Loads https://www.youtube.com/iframe_api once, only after someone presses play. */
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
      setTimeout(() => {
        apiPromise = null;
        reject(new Error("YouTube player timed out"));
      }, 15000);
    });
  }
  return apiPromise;
}

/** YouTube's documented onError codes. */
export function errorMessage(code: number | "load"): string {
  if (code === 101 || code === 150 || code === 153) return "The owner doesn't allow this video to be played on other sites.";
  if (code === 100) return "This video is no longer available (removed or private).";
  if (code === 2) return "This video link isn't valid.";
  if (code === 5) return "Your browser couldn't play this video.";
  if (code === "load") return "The YouTube player didn't load — the video may be unavailable, or YouTube may be blocked on this network.";
  return "This video can't be played here right now.";
}

/**
 * What the player is really doing, taken from YouTube's own state events.
 * "blocked" = we asked YouTube to play but it never started (usually the
 * browser's autoplay policy); the viewer has to press play themselves.
 */
export type Playback =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "playing" }
  | { kind: "paused" }
  | { kind: "buffering" }
  | { kind: "ended" }
  | { kind: "blocked" }
  | { kind: "error"; code: number | "load" };

export interface PlayerVideo {
  id: string;
  title: string;
  thumbnailUrl: string;
}

const YT_STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

/**
 * One persistent YouTube player for a whole queue ("lite" until started):
 * - before the viewer presses start, only the real thumbnail is shown — no
 *   iframe, no YouTube script, nothing plays
 * - after start, ONE player is created and later videos are swapped in with
 *   loadVideoById, so there is never more than one player on the page
 * - playback state comes from YouTube's events; nothing claims "playing"
 *   unless YouTube reported it
 * - removed / blocked / non-embeddable videos show a fallback with a YouTube
 *   link and (when there is one) a skip button
 * - destroyed when the component unmounts (e.g. navigating away)
 */
export function YouTubePlayer({
  video,
  started,
  onStart,
  onPlayback,
  onEnded,
  onSkip,
  hasNext,
  startLabel = "Start watching",
  startHint,
  muted = false,
}: {
  video: PlayerVideo;
  /** True once the viewer pressed start (or picked a video). */
  started: boolean;
  onStart: () => void;
  onPlayback?: (p: Playback) => void;
  onEnded?: () => void;
  onSkip?: () => void;
  hasNext?: boolean;
  startLabel?: string;
  startHint?: string;
  /** Start muted (browsers only allow autoplay without a click when muted). */
  muted?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const ready = useRef(false);
  const loadedId = useRef<string | null>(null);
  const wantedId = useRef(video.id);
  const [playback, setPlaybackState] = useState<Playback>({ kind: "idle" });
  const [thumbFailedFor, setThumbFailedFor] = useState<string | null>(null);
  const thumbFailed = thumbFailedFor === video.id;
  /** Mirrors ready.current for rendering (skip only works once a player exists). */
  const [isReady, setIsReady] = useState(false);
  const [soundOff, setSoundOff] = useState(muted);
  const watchUrl = `https://www.youtube.com/watch?v=${video.id}`;

  // Keep callbacks in refs so the player isn't rebuilt when they change.
  const cb = useRef({ onPlayback, onEnded, title: video.title });
  useEffect(() => {
    cb.current = { onPlayback, onEnded, title: video.title };
  });
  const playbackRef = useRef<Playback>(playback);
  function setPlayback(p: Playback) {
    playbackRef.current = p;
    setPlaybackState(p);
    cb.current.onPlayback?.(p);
  }

  // "Blocked" detection: if YouTube hasn't started playing a few seconds after we asked, say so.
  const blockTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  function armBlockedCheck() {
    clearTimeout(blockTimer.current);
    blockTimer.current = setTimeout(() => {
      const k = playbackRef.current.kind;
      if (k === "loading") setPlayback({ kind: "blocked" });
    }, 6000);
  }

  // Create the single player once started.
  useEffect(() => {
    if (!started || !host.current) return;
    let cancelled = false;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const mount = document.createElement("div");
    host.current.appendChild(mount);
    setPlayback({ kind: "loading" });
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled) return;
        loadedId.current = wantedId.current;
        player.current = new YT.Player(mount, {
          videoId: wantedId.current,
          host: "https://www.youtube-nocookie.com",
          width: "100%",
          height: "100%",
          // autoplay only follows the viewer's own click on start / a queue item.
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, mute: muted ? 1 : 0 },
          events: {
            onReady: (e) => {
              ready.current = true;
              setIsReady(true);
              clearTimeout(watchdog);
              e.target.getIframe().title = `${cb.current.title} — YouTube video player`;
              // The viewer may have picked another video while the API loaded.
              if (wantedId.current !== loadedId.current) {
                loadedId.current = wantedId.current;
                e.target.loadVideoById(wantedId.current);
              }
              armBlockedCheck();
            },
            onStateChange: (e) => {
              if (cancelled) return;
              // The viewer may have unmuted with YouTube's own controls.
              try {
                setSoundOff(player.current?.isMuted() ?? false);
              } catch {
                /* player not ready */
              }
              if (e.data === YT_STATE.PLAYING) {
                clearTimeout(blockTimer.current);
                setPlayback({ kind: "playing" });
              } else if (e.data === YT_STATE.PAUSED) setPlayback({ kind: "paused" });
              else if (e.data === YT_STATE.BUFFERING) setPlayback({ kind: "buffering" });
              else if (e.data === YT_STATE.ENDED) {
                setPlayback({ kind: "ended" });
                cb.current.onEnded?.();
              }
            },
            onError: (e) => {
              if (cancelled) return;
              clearTimeout(blockTimer.current);
              setPlayback({ kind: "error", code: e.data });
            },
          },
        });
        // Some unavailable videos never report ready or error: fall back after a while.
        watchdog = setTimeout(() => {
          if (!cancelled && !ready.current) setPlayback({ kind: "error", code: "load" });
        }, 15000);
      })
      .catch(() => {
        if (!cancelled) setPlayback({ kind: "error", code: "load" });
      });
    return () => {
      cancelled = true;
      clearTimeout(watchdog);
      clearTimeout(blockTimer.current);
      try {
        player.current?.destroy();
      } catch {
        /* already gone */
      }
      player.current = null;
      ready.current = false;
      setIsReady(false);
      loadedId.current = null;
      mount.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the player is created once per "started" session
  }, [started]);

  // Swap videos inside the same player.
  useEffect(() => {
    wantedId.current = video.id;
    if (!started || !ready.current || !player.current || loadedId.current === video.id) return;
    loadedId.current = video.id;
    setPlayback({ kind: "loading" });
    player.current.getIframe().title = `${video.title} — YouTube video player`;
    player.current.loadVideoById(video.id);
    armBlockedCheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the chosen video only
  }, [video.id, started]);

  const showCover = !started;
  const error = playback.kind === "error" ? playback : null;

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-ink shadow-[0_24px_50px_-28px_rgb(0_0_0/0.8)] ring-1 ring-on-ink/10">
      {/* Player mount point (filled once started) */}
      <div ref={host} className={cn("absolute inset-0 [&>div]:h-full [&>iframe]:h-full [&>iframe]:w-full", error && "invisible")} />

      {started && playback.kind === "loading" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="size-9 animate-spin rounded-full border-2 border-on-ink/25 border-t-signal" />
        </div>
      )}

      {showCover && (
        <div className="absolute inset-0">
          {!thumbFailed ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote YouTube thumbnail; fixed 16:9 box
            <img
              src={video.thumbnailUrl.replace("/hqdefault.", "/maxresdefault.").replace("/mqdefault.", "/hqdefault.")}
              alt=""
              width={1280}
              height={720}
              decoding="async"
              onError={(e) => {
                const img = e.currentTarget;
                // maxres isn't generated for every video: fall back to the thumbnail we were given.
                if (!img.src.endsWith(video.thumbnailUrl) && img.src !== video.thumbnailUrl) img.src = video.thumbnailUrl;
                else setThumbFailedFor(video.id);
              }}
              className="size-full object-cover"
            />
          ) : (
            <div aria-hidden className="size-full bg-[radial-gradient(circle_at_30%_30%,rgb(200_241_105/0.25),transparent_60%)]" />
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-ink/10" />
          <button
            type="button"
            onClick={onStart}
            className="on-ink group absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center"
            aria-label={`${startLabel}: ${video.title}`}
          >
            <span className="flex items-center gap-2.5 rounded-full bg-signal py-3 pr-6 pl-4 text-base font-semibold text-on-signal shadow-[0_10px_30px_-8px_rgb(200_241_105/0.6)] transition-transform duration-[var(--duration-base)] group-hover:scale-[1.04] group-active:scale-[0.98]">
              <span className="grid size-8 place-items-center rounded-full bg-ink text-signal">
                <Play aria-hidden className="size-4 translate-x-px fill-current" />
              </span>
              {startLabel}
            </span>
            {startHint && <span className="max-w-sm text-sm text-on-ink/80">{startHint}</span>}
          </button>
        </div>
      )}

      {started && soundOff && (playback.kind === "playing" || playback.kind === "buffering") && (
        <button
          type="button"
          onClick={() => {
            player.current?.unMute();
            setSoundOff(false);
          }}
          className="on-ink absolute top-3 right-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-ink/80 px-4 text-sm font-semibold text-on-ink shadow-raised hover:bg-ink"
        >
          <Volume2 aria-hidden className="size-4 text-signal" />
          Tap for sound
        </button>
      )}

      {started && playback.kind === "blocked" && (
        <div className="on-ink absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-3 bg-gradient-to-t from-ink via-ink/85 to-transparent p-4 pt-10 text-sm text-on-ink">
          <span role="status">Your browser paused autoplay. Press play to continue.</span>
          <button
            type="button"
            onClick={() => {
              setPlayback({ kind: "loading" });
              player.current?.playVideo();
              armBlockedCheck();
            }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-signal px-4 font-semibold text-on-signal"
          >
            <Play aria-hidden className="size-4 fill-current" /> Play
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="on-ink absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-on-ink">
          <VideoOff aria-hidden className="size-7 text-on-ink/70" />
          <p className="max-w-xs text-sm">{errorMessage(error.code)}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {hasNext && onSkip && isReady && (
              <button
                type="button"
                onClick={onSkip}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-signal px-4 text-sm font-semibold text-on-signal"
              >
                <SkipForward aria-hidden className="size-4" /> Play next
              </button>
            )}
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
        </div>
      )}

      {started && playback.kind === "loading" && (
        <p role="status" className="sr-only">
          Loading the YouTube player…
        </p>
      )}
    </div>
  );
}
