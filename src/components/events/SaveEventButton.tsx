"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { LiveEvent } from "@/domain/types";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { cn } from "@/lib/cn";

/**
 * Save / unsave toggle. Duplicate saves are impossible (reducer no-op on the
 * client, primary key on the server). The success toast waits for the save
 * to actually succeed; a failed write shows the sync-error banner instead.
 */
export function SaveEventButton({ event, className }: { event: LiveEvent; className?: string }) {
  const { state, run, persistence, mode } = useOnboarding();
  const toast = useToast();
  const savedEntry = state.savedEvents.find((s) => s.eventId === event.id);
  const saved = Boolean(savedEntry);
  const where =
    mode === "server" ? "" : persistence === "unavailable" ? " in this browser only (it may be lost on refresh)" : " in this browser";

  async function toggle() {
    if (savedEntry) {
      const r = await run({ type: "unsave_event", eventId: event.id });
      if (r.ok) {
        toast({
          message: `Removed ${event.artistNames[0]} from Saved shows.`,
          tone: "info",
          action: { label: "Undo", onAction: () => void run({ type: "restore_saved_event", saved: savedEntry }) },
        });
      }
    } else {
      const r = await run({ type: "save_event", event, at: new Date().toISOString() });
      if (r.ok) toast({ message: `Saved ${event.artistNames[0]} in ${event.cityName}${where}.` });
    }
  }

  const Icon = saved ? BookmarkCheck : Bookmark;
  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={() => void toggle()}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition-colors",
        saved
          ? "border-signal/60 bg-signal/10 text-fg hover:bg-signal/15"
          : "border-line-strong text-fg-secondary hover:border-fg-muted hover:text-fg",
        className,
      )}
    >
      <Icon aria-hidden className={cn("size-4", saved && "animate-pop text-signal")} />
      {saved ? "Saved" : "Save"}
      <span className="sr-only">
        {" "}
        {event.artistNames[0]} in {event.cityName}
      </span>
    </button>
  );
}
