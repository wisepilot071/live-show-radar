"use client";

import { Users } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArtistSearchPanel } from "@/components/artists/ArtistSearchPanel";
import { Card } from "@/components/ui/Card";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { artistIdentityKey } from "@/domain/artist-identity";
import type { Artist } from "@/domain/types";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { previousStep, STEPS } from "@/features/onboarding/steps";
import { useOnboardingSubmit } from "@/features/onboarding/useOnboardingSubmit";
import { pluralize } from "@/lib/format";
import { SelectedArtistChips } from "./SelectedArtistList";
import { StepLayout, StepNav } from "./StepLayout";

/** Mirror the query into the URL so refresh and back/forward keep it. */
function syncQueryToUrl(query: string) {
  const url = new URL(window.location.href);
  if (query.trim()) url.searchParams.set("q", query);
  else url.searchParams.delete("q");
  window.history.replaceState(window.history.state, "", url);
}

export function ArtistSearchStep() {
  const params = useSearchParams();
  const { state, dispatch } = useOnboarding();
  const [announcement, setAnnouncement] = useState("");
  const submit = useOnboardingSubmit();

  const selectedKeys = useMemo(() => new Set(state.selections.map((s) => artistIdentityKey(s.artist))), [state.selections]);

  function toggle(artist: Artist) {
    const wasSelected = selectedKeys.has(artistIdentityKey(artist));
    dispatch({ type: "toggle_artist", artist, addedVia: "manual", at: new Date().toISOString() });
    const count = state.selections.length + (wasSelected ? -1 : 1);
    setAnnouncement(`${wasSelected ? "Removed" : "Added"} ${artist.name}. ${pluralize(count, "artist")} selected.`);
  }

  function remove(identityKey: string) {
    const sel = state.selections.find((s) => artistIdentityKey(s.artist) === identityKey);
    dispatch({ type: "remove_artist", identityKey });
    if (sel) setAnnouncement(`Removed ${sel.artist.name}. ${pluralize(state.selections.length - 1, "artist")} selected.`);
  }

  const back = previousStep(state.method, "artists");
  const count = state.selections.length;

  return (
    <StepLayout
      width="default"
      eyebrow={state.method === "mix" ? "Mix both · Part 2 of 2" : "Choose artists"}
      title="Who would you hate to miss?"
      description="Pick a few to start — you can add the rest any time. Next: your cities and what's worth an alert."
      footer={
        <StepNav
          backHref={back?.path ?? "/"}
          backLabel={back ? "Back" : "Home"}
          aside={
            <span aria-hidden>
              <span className="font-semibold text-fg tabular-nums">{count}</span> selected
            </span>
          }
          next={{
            kind: "action",
            label: submit.busy ? "Saving your artists…" : "Continue",
            onClick: () => void submit.advance(STEPS.location.path),
            disabled: count === 0,
            loading: submit.busy,
          }}
        />
      }
    >
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {submit.error && (
        <InlineAlert tone="error" live title="Your artists didn't all save" className="mb-6">
          {submit.error} Your selected artists are still here.
        </InlineAlert>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <ArtistSearchPanel
          isSelected={(a) => selectedKeys.has(artistIdentityKey(a))}
          onToggle={toggle}
          initialQuery={params.get("q") ?? ""}
          onQueryChange={syncQueryToUrl}
        />

        <aside aria-labelledby="selected-heading" className="lg:sticky lg:top-40 lg:self-start">
          <Card tone="raised" className="space-y-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="selected-heading" className="font-display text-lg font-bold">
                Your artists
              </h2>
              <p className="font-mono text-sm text-fg-secondary tabular-nums">
                <span className="text-signal-ink">{count}</span> selected
              </p>
            </div>
            {count === 0 ? (
              <div className="flex items-start gap-3 rounded-md border border-dashed border-line-strong p-4 text-sm text-fg-secondary">
                <Users aria-hidden className="mt-0.5 size-4 shrink-0" />
                Nothing yet. Tap an artist to add them — tap again to remove.
              </div>
            ) : (
              <SelectedArtistChips selections={state.selections} onRemove={remove} />
            )}
          </Card>
        </aside>
      </div>
    </StepLayout>
  );
}
