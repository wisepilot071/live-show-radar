"use client";

import { RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";

/** Shown whenever a change couldn't be saved — so nothing looks saved when it isn't. */
export function SyncErrorBanner({ className }: { className?: string }) {
  const { syncError, clearSyncError, reload } = useOnboarding();
  if (!syncError) return null;
  return (
    <InlineAlert
      tone="error"
      live
      title="A change wasn't saved"
      className={className}
      action={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={reload} leadingIcon={<RotateCw aria-hidden className="size-4" />}>
            Reload from server
          </Button>
          <Button variant="ghost" onClick={clearSyncError} leadingIcon={<X aria-hidden className="size-4" />}>
            Dismiss
          </Button>
        </div>
      }
    >
      {syncError}
    </InlineAlert>
  );
}
