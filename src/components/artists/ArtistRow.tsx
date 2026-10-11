"use client";

import { ChevronDown, SearchCheck, Trash2 } from "lucide-react";
import { useId, type ReactNode } from "react";
import { ArtistAvatar } from "@/components/onboarding/ArtistAvatar";
import { artistContext } from "@/components/onboarding/ArtistResult";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ArtistSelection } from "@/domain/types";
import { cn } from "@/lib/cn";
import { formatTimestamp } from "@/lib/format";

const ORIGIN_LABEL: Record<ArtistSelection["artist"]["origin"], string> = {
  sample_catalogue: "Sample catalogue",
  user_entered: "Added as typed",
  spotify: "Imported from Spotify",
  event_source: "From an event source",
  illustrative: "Example",
  musicbrainz: "MusicBrainz",
  user_submitted: "From a pasted announcement",
};

/** One followed artist: summary row + expandable details. */
export function ArtistRow({
  id,
  selection,
  expanded,
  highlighted,
  onToggleExpanded,
  onRemove,
  onResolve,
}: {
  id?: string;
  selection: ArtistSelection;
  expanded: boolean;
  highlighted?: boolean;
  onToggleExpanded: () => void;
  onRemove: () => void;
  onResolve: () => void;
}) {
  const { artist } = selection;
  const detailsId = useId();
  const typed = artist.origin === "user_entered";
  // Discovery sources look artists up by MusicBrainz id; without one, coverage is incomplete.
  const linked = Boolean(artist.externalIds?.musicbrainz);

  return (
    <li
      id={id}
      className={cn(
        "transition-colors duration-[var(--duration-slow)]",
        highlighted && "bg-signal/30",
      )}
    >
      <div className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
        <ArtistAvatar artist={artist} />
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={onToggleExpanded}
          className="group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-fg group-hover:text-signal-ink">{artist.name}</span>
            <span className="block truncate text-sm text-fg-muted">
              {typed ? "Added as typed · not matched yet" : artistContext(artist) || ORIGIN_LABEL[artist.origin]}
              {!typed && !linked ? " · not linked" : ""}
            </span>
          </span>
          <ChevronDown
            aria-hidden
            className={cn("size-4 shrink-0 text-fg-muted transition-transform", expanded && "rotate-180")}
          />
          <span className="sr-only">{expanded ? "Hide details" : "Show details"}</span>
        </button>
        <StatusBadge
          tone={linked ? "unknown" : "unconfirmed"}
          label={linked ? "Selected" : typed ? "Unmatched" : "Not linked"}
          className="hidden sm:inline-flex"
        />
        <button
          type="button"
          onClick={onRemove}
          className="grid size-11 shrink-0 place-items-center rounded-md text-fg-secondary transition-colors hover:bg-urgent/10 hover:text-urgent-ink"
          aria-label={`Remove ${artist.name}`}
        >
          <Trash2 aria-hidden className="size-4.5" />
        </button>
      </div>

      <div id={detailsId} hidden={!expanded} className="border-t border-line/50 bg-inset/60 px-4 py-4 sm:pl-[4.75rem]">
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Detail label="Record">{ORIGIN_LABEL[artist.origin]}</Detail>
          <Detail label="Identity">
            {typed
              ? "Typed name — not linked to a catalogue record"
              : linked
                ? `MusicBrainz ${artist.externalIds?.musicbrainz}`
                : `Sample record ${artist.id} — not linked to MusicBrainz`}
          </Detail>
          {artist.disambiguation && <Detail label="Which one">{artist.disambiguation}</Detail>}
          {artist.genres?.length ? <Detail label="Genres">{artist.genres.join(", ")}</Detail> : null}
          <Detail label="Added">
            {formatTimestamp(selection.selectedAt)} · {selection.addedVia === "spotify" ? "from Spotify" : "manually"}
          </Detail>
          <Detail label="Discovery">
            <span className="flex flex-wrap items-center gap-2">
              {linked ? (
                <>
                  <StatusBadge tone="unknown" label="Selected" />
                  <span className="text-fg-muted">Checked when you run a check. Scheduled monitoring isn&rsquo;t active yet.</span>
                </>
              ) : (
                <>
                  <StatusBadge tone="unconfirmed" label="Coverage incomplete" />
                  <span className="text-fg-muted">No connected source can look this artist up until it&rsquo;s linked.</span>
                </>
              )}
            </span>
          </Detail>
        </dl>
        {!linked && (
          <div className="mt-4">
            <Button variant="secondary" onClick={onResolve} leadingIcon={<SearchCheck aria-hidden className="size-4" />}>
              {typed ? "Find the right artist" : "Link to MusicBrainz"}
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="break-words text-fg">{children}</dd>
    </div>
  );
}
