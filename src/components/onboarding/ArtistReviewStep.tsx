"use client";

import { Plus, Trash2, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { artistIdentityKey } from "@/domain/artist-identity";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { previousStep, STEPS } from "@/features/onboarding/steps";
import { pluralize } from "@/lib/format";
import { ArtistAvatar } from "./ArtistAvatar";
import { artistContext } from "./ArtistResult";
import { StepLayout, StepNav } from "./StepLayout";

export function ArtistReviewStep() {
  const { state, dispatch } = useOnboarding();
  const count = state.selections.length;
  const back = previousStep(state.method, "review");
  const typedCount = state.selections.filter((s) => s.artist.origin === "user_entered").length;

  return (
    <StepLayout
      width="narrow"
      eyebrow="Review"
      title={count ? `${pluralize(count, "artist")} on your list` : "Your list is empty"}
      description={
        count
          ? "Once you finish setup, we check these artists' upcoming shows daily and when you tap “Check now” on your radar."
          : undefined
      }
      footer={
        <StepNav
          backHref={back?.path}
          next={count ? { kind: "link", href: STEPS.location.path, label: "Looks good" } : undefined}
        />
      }
    >
      {count === 0 ? (
        <EmptyState
          icon={Users}
          title="Add at least one artist to continue"
          action={
            <ButtonLink href={STEPS.artists.path} leadingIcon={<Plus aria-hidden className="size-4" />}>
              Find artists
            </ButtonLink>
          }
        >
          Your radar is built around the artists you choose. There&rsquo;s no minimum beyond one — add more any time.
        </EmptyState>
      ) : (
        <div className="space-y-5">
          {typedCount > 0 && (
            <InlineAlert tone="info">
              {pluralize(typedCount, "artist")} added as typed. {typedCount === 1 ? "It" : "They"}&rsquo;ll be matched
              to a catalogue record later; until then we won&rsquo;t merge {typedCount === 1 ? "it" : "them"} with
              similarly named artists.
            </InlineAlert>
          )}

          <ul className="divide-y divide-line/60 overflow-hidden rounded-lg border border-line bg-surface">
            {state.selections.map((s) => {
              const key = artistIdentityKey(s.artist);
              const context = artistContext(s.artist);
              return (
                <li key={key} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                  <ArtistAvatar artist={s.artist} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-fg">{s.artist.name}</p>
                    <p className="truncate text-sm text-fg-muted">
                      {s.artist.origin === "user_entered" ? "Added as typed · not matched yet" : context}
                    </p>
                  </div>
                  <StatusBadge tone="unknown" label="Selected" className="hidden sm:inline-flex" />
                  <button
                    type="button"
                    onClick={() => dispatch({ type: "remove_artist", identityKey: key })}
                    className="grid size-11 shrink-0 place-items-center rounded-md text-fg-secondary transition-colors hover:bg-urgent/10 hover:text-urgent"
                    aria-label={`Remove ${s.artist.name}`}
                  >
                    <Trash2 aria-hidden className="size-4.5" />
                  </button>
                </li>
              );
            })}
          </ul>

          <ButtonLink href={STEPS.artists.path} variant="secondary" leadingIcon={<Plus aria-hidden className="size-4" />}>
            Add more artists
          </ButtonLink>
        </div>
      )}
    </StepLayout>
  );
}
