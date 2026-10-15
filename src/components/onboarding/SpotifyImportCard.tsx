"use client";

import { Music2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { InlineAlert } from "@/components/ui/InlineAlert";
import type { SpotifyAvailability } from "@/integrations/spotify/contract";
import { SPOTIFY_PLANNED_SCOPES } from "@/integrations/spotify/contract";
import { clientFetch } from "@/lib/client-fetch";
import { pluralize } from "@/lib/format";

type Outcome = { tone: "success" | "info" | "error"; title: string; body: string; refresh?: boolean };

/** The message for the `?spotify=` result the import redirects back with. */
function outcomeFrom(search: URLSearchParams): Outcome | null {
  const result = search.get("spotify");
  const n = Number(search.get("n") ?? 0);
  const total = Number(search.get("total") ?? 0);
  switch (result) {
    case null:
      return null;
    case "imported":
      return { tone: "success", title: `Imported ${pluralize(n, "artist")} from Spotify`, body: "They're on your radar now. Their shows are being looked up." };
    case "importing":
      return {
        tone: "success",
        title: `Imported ${n} of ${total} artists so far`,
        body: "The rest are being added in the background over the next few minutes.",
        refresh: true,
      };
    case "empty":
      return { tone: "info", title: "No artists to import", body: "This Spotify account doesn't follow any artists and has no top artists yet." };
    case "denied":
      return { tone: "info", title: "Spotify import cancelled", body: "Nothing was imported. You can pick artists below instead." };
    case "read_failed":
      return {
        tone: "error",
        title: "Spotify didn't share your artists",
        body: "While the Spotify app is in development mode, only Spotify accounts added to its user list can import. Pick artists below, or try again later.",
      };
    case "not_configured":
      return { tone: "error", title: "Spotify import isn't set up on this server", body: "Pick artists below instead." };
    default:
      return { tone: "error", title: "The Spotify import didn't finish", body: "Nothing was changed. Please try again." };
  }
}

const noSubscribe = () => () => {};

/**
 * Import the artists someone follows on Spotify (plus their top artists), once.
 * Shows the real "Connect" button only when the server has Spotify configured;
 * otherwise it stays an honest "Coming soon" card. Uses Spotify's name/green to
 * identify the service; no logo and no implied partnership.
 */
export function SpotifyImportCard({ from }: { from: "onboarding" | "artists" }) {
  const [availability, setAvailability] = useState<SpotifyAvailability | null>(null);
  const [open, setOpen] = useState(false);
  // The import's result rides on the URL after Spotify's redirect (empty on the server render).
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");
  const outcome = outcomeFrom(new URLSearchParams(search));

  useEffect(() => {
    const controller = new AbortController();
    clientFetch("/api/integrations/spotify", { signal: controller.signal, cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json()) as { ok: boolean; data?: SpotifyAvailability };
        setAvailability(body.ok && body.data ? body.data : { available: false, reason: "credentials_missing" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setAvailability({ available: false, reason: "credentials_missing" });
      });
    return () => controller.abort();
  }, []);

  const available = availability?.available === true;
  const startHref = `/api/integrations/spotify/start?from=${from}`;

  return (
    <div className="space-y-3">
      {outcome && (
        <InlineAlert tone={outcome.tone} live title={outcome.title}>
          {outcome.body}{" "}
          {outcome.refresh && (
            <a href={from === "onboarding" ? "/onboarding/artists" : "/artists"} className="font-semibold text-signal-ink underline underline-offset-2">
              Show my updated list
            </a>
          )}
        </InlineAlert>
      )}
      <section aria-labelledby="spotify-card-title" className="flex flex-col gap-4 rounded-xl border border-line bg-surface shadow-card p-4 sm:flex-row sm:items-center sm:p-5">
        <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-[#1DB954] text-[#06140b]">
          <Music2 className="size-6" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="spotify-card-title" className="font-display text-lg leading-tight font-semibold">
              {available ? "Import your artists from Spotify" : "Connect your music taste"}
            </h2>
            {availability && !available && (
              <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-fg-secondary">Coming soon</span>
            )}
          </div>
          <p className="text-sm text-fg-secondary">
            {available
              ? "We read the artists you follow and your top artists once, and add them to your radar. Nothing is posted, and your Spotify login isn't kept."
              : "In a future update, import artists you already follow on Spotify and discover their upcoming concerts automatically. For now, pick your artists below — it only takes a minute."}
          </p>
        </div>
        {available ? (
          <Button variant="secondary" onClick={() => setOpen(true)} className="shrink-0">
            Import from Spotify
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setOpen(true)} className="shrink-0" disabled={!availability}>
            Connect Spotify
          </Button>
        )}
      </section>
      {available ? (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Import from Spotify"
          description="You'll sign in on Spotify's own page. Live Show Radar asks to read only:"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Not now
              </Button>
              <a
                href={startHref}
                className="inline-flex items-center justify-center rounded-full bg-[#1DB954] px-4 py-2 text-sm font-semibold text-[#06140b] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                Continue to Spotify
              </a>
            </>
          }
        >
          <ul className="space-y-2 text-sm">
            {SPOTIFY_PLANNED_SCOPES.map((s) => (
              <li key={s.scope}>
                <span className="font-semibold">{s.title}</span> — <span className="text-fg-secondary">{s.usage}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-fg-muted">
            Imported artists are followed straight away; you can remove any of them later. Live Show Radar isn&rsquo;t affiliated with or endorsed by Spotify.
          </p>
        </Dialog>
      ) : (
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title="Spotify import is coming soon"
          description="Importing the artists you follow on Spotify isn't switched on for this server yet. Nothing has been connected and no Spotify data is accessed."
          footer={<Button onClick={() => setOpen(false)}>Pick artists manually</Button>}
        >
          <p className="text-xs text-fg-muted">Live Show Radar isn&rsquo;t affiliated with or endorsed by Spotify.</p>
        </Dialog>
      )}
    </div>
  );
}
