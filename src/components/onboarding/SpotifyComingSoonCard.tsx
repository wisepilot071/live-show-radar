"use client";

import { Music2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/**
 * FRONTEND-ONLY future-feature card. Pressing "Connect Spotify" only opens an
 * explanation: there is no redirect, OAuth, API request, credential or
 * simulated import. Self-contained so a real integration can replace the
 * dialog later. Uses Spotify's name/green to identify the service; no logo
 * and no implied partnership.
 */
export function SpotifyComingSoonCard() {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby="spotify-card-title" className="flex flex-col gap-4 rounded-xl border border-line bg-surface shadow-card p-4 sm:flex-row sm:items-center sm:p-5">
      <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-[#1DB954] text-[#06140b]">
        <Music2 className="size-6" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="spotify-card-title" className="font-display text-lg leading-tight font-semibold">
            Connect your music taste
          </h2>
          <span className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-semibold text-fg-secondary">Coming soon</span>
        </div>
        <p className="text-sm text-fg-secondary">
          In a future update, import artists you already follow on Spotify and discover their upcoming concerts automatically. For now, pick
          your artists below — it only takes a minute.
        </p>
      </div>
      <Button variant="secondary" onClick={() => setOpen(true)} className="shrink-0">
        Connect Spotify
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Spotify import is coming soon"
        description="Importing the artists you follow on Spotify is planned for a future update. Nothing has been connected and no Spotify data is accessed."
        footer={<Button onClick={() => setOpen(false)}>Pick artists manually</Button>}
      >
        <p className="text-xs text-fg-muted">Live Show Radar isn&rsquo;t affiliated with or endorsed by Spotify.</p>
      </Dialog>
    </section>
  );
}
