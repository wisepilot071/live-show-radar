"use client";

import { ExternalLink, Lock, RotateCw, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIntegrationStatus } from "@/features/integrations/useIntegrationStatus";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { previousStep, STEPS } from "@/features/onboarding/steps";
import { SPOTIFY_PLANNED_SCOPES, type SpotifyConnectionStatus } from "@/integrations/spotify/contract";
import { SPOTIFY_STATUS_COPY } from "./spotify-status-copy";
import { StepLayout, StepNav } from "./StepLayout";

export function SpotifyStep() {
  const router = useRouter();
  const { state, dispatch } = useOnboarding();
  const { status, retry } = useIntegrationStatus();
  const connectHelpId = useId();
  const back = previousStep(state.method, "spotify");

  const available = status.phase === "ready" && status.report.spotify.available;
  const shown: SpotifyConnectionStatus = status.phase === "ready" && !available ? "unavailable" : state.spotify;
  const copy = SPOTIFY_STATUS_COPY[shown];

  function continueManually() {
    dispatch({ type: "fallback_to_manual" });
    router.push(STEPS.artists.path);
  }

  const isMix = state.method === "mix";

  return (
    <StepLayout
      eyebrow={isMix ? "Mix both · Part 1 of 2" : "Connect Spotify"}
      title="Bring in artists from Spotify"
      description="Optional. If you'd rather not connect, you can search for your artists instead — it works just as well."
      footer={
        <StepNav
          backHref={back?.path}
          next={{
            kind: "action",
            label: isMix ? "Skip import, add artists" : "Continue manually",
            onClick: continueManually,
          }}
        />
      }
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card tone="raised" className="space-y-6 p-5 sm:p-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold">Before you connect</h2>
            {status.phase === "ready" && <StatusBadge tone={copy.tone} label={copy.label} />}
          </div>

          <section aria-labelledby="sp-why" className="space-y-2">
            <h3 id="sp-why" className="font-semibold text-fg">
              Why we ask
            </h3>
            <p className="text-fg-secondary">
              To pre-fill your artist list so you don&rsquo;t have to type all of them. We use it only to personalise
              which shows you see.
            </p>
          </section>

          <section aria-labelledby="sp-what" className="space-y-3">
            <h3 id="sp-what" className="font-semibold text-fg">
              What we&rsquo;d request
            </h3>
            <ul className="space-y-2">
              {SPOTIFY_PLANNED_SCOPES.map((s) => (
                <li key={s.scope} className="flex gap-3 rounded-md border border-line/70 bg-inset p-3">
                  <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-signal" />
                  <div>
                    <p className="text-sm font-semibold text-fg">{s.title}</p>
                    <p className="text-sm text-fg-secondary">{s.usage}</p>
                    <p className="mt-1 font-mono text-[0.7rem] text-fg-muted">Spotify permission: {s.scope}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-sm text-fg-muted">
              Read-only. We never post, follow, or change anything in your Spotify account. Spotify may not share a
              complete list — you can always add missing artists yourself.
            </p>
          </section>

          <section aria-labelledby="sp-how" className="space-y-2">
            <h3 id="sp-how" className="font-semibold text-fg">
              How it works
            </h3>
            <p className="flex gap-2 text-fg-secondary">
              <Lock aria-hidden className="mt-1 size-4 shrink-0" />
              You sign in on Spotify&rsquo;s own page. We never see your Spotify password.
            </p>
          </section>
        </Card>

        <div className="space-y-4">
          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="font-display text-lg font-bold">Connection</h2>
            {status.phase === "loading" && <LoadingIndicator label="Checking whether Spotify import is available…" />}
            {status.phase === "error" && (
              <InlineAlert
                tone="error"
                live
                title="Couldn't check Spotify availability"
                action={
                  <Button variant="secondary" onClick={retry} leadingIcon={<RotateCw aria-hidden className="size-4" />}>
                    Try again
                  </Button>
                }
              >
                Your selections are safe. You can retry or continue manually.
              </InlineAlert>
            )}
            {status.phase === "ready" && (
              <>
                <p className="text-sm text-fg-secondary" id={connectHelpId}>
                  {copy.message}
                  {!available && " We'll turn this on once it's built and verified."}
                </p>
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={!available}
                  aria-describedby={connectHelpId}
                  trailingIcon={<ExternalLink aria-hidden className="size-4" />}
                >
                  {available ? "Connect with Spotify" : "Spotify connection unavailable"}
                </Button>
              </>
            )}
          </Card>

          <InlineAlert tone="success" title="Manual works just as well">
            Search our catalogue for your artists. {isMix ? "Anything imported later merges in without duplicates." : ""}
          </InlineAlert>
        </div>
      </div>
    </StepLayout>
  );
}
