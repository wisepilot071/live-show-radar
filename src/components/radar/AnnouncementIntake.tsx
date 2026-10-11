"use client";

import { Sparkles, Wand2 } from "lucide-react";
import { useId, useState } from "react";
import { EventCard } from "@/components/events/EventCard";
import { EventActions } from "@/components/events/EventActions";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { TextField } from "@/components/ui/TextField";
import type { LiveEvent } from "@/domain/types";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { cn } from "@/lib/cn";
import { clientFetch } from "@/lib/client-fetch";

type Outcome =
  | { status: "extracted"; event: LiveEvent; dropped: string[]; uncertainties: string[]; announcementType: string; cached: boolean }
  | {
      status: "not_an_event" | "no_matching_artist" | "ambiguous_artist" | "needs_review";
      message: string;
      dropped: string[];
      extraction?: { artists: string[]; date: string | null; dateText: string | null; venue: string | null; city: string | null; uncertainties: string[] };
    };

const MIN = 20;
const MAX = 4000;
const FIELD_LABEL: Record<string, string> = {
  event_title: "title",
  start_time: "start time",
  venue: "venue",
  city: "city",
  country: "country",
  ticket_url: "ticket link",
  ticket_sale_opens: "sale date",
  date: "date",
  early_bird: "early-bird claim",
};

/**
 * Paste an announcement you've seen (Instagram caption, email, post).
 * Gemini Flash extracts the facts on the server; anything not supported by
 * the text is dropped, and the show is stored as UNCONFIRMED until another
 * source corroborates it.
 */
export function AnnouncementIntake({ onExtracted }: { onExtracted: () => void }) {
  const { state } = useOnboarding();
  const textId = useId();
  const errorId = useId();
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function submit() {
    const trimmed = text.trim();
    if (trimmed.length < MIN) return setInputError(`Paste at least ${MIN} characters of the announcement.`);
    setInputError(null);
    setRequestError(null);
    setOutcome(null);
    setBusy(true);
    try {
      const res = await clientFetch("/api/me/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, sourceUrl: link.trim() || undefined }),
      }, 60_000); // the server may take up to ~45s reading the text with AI
      const body = (await res.json()) as { ok: true; data: Outcome } | { ok: false; error: { message: string } };
      if (!body.ok) setRequestError(body.error.message);
      else {
        setOutcome(body.data);
        if (body.data.status === "extracted") onExtracted();
      }
    } catch {
      setRequestError("Couldn't reach the server. Nothing was saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="intake-title" className="space-y-4 rounded-xl border border-line bg-surface shadow-card p-4 sm:p-6">
      <div className="space-y-1">
        <h2 id="intake-title" className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          <Wand2 aria-hidden className="size-5 text-signal-ink" />
          Seen an announcement?
        </h2>
        <p className="max-w-2xl text-sm text-fg-secondary">
          Paste the post or email. Gemini reads it and pulls out only what it actually says — artist, date, venue, tickets.
          Shows added this way stay <strong className="text-fg">unconfirmed</strong> until another source backs them up.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor={textId} className="block text-sm font-semibold text-fg">
          Announcement text
        </label>
        <textarea
          id={textId}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (inputError) setInputError(null);
          }}
          maxLength={MAX}
          rows={5}
          aria-invalid={inputError ? true : undefined}
          aria-describedby={inputError ? errorId : undefined}
          placeholder="e.g. ‘Prateek Kuhad — live in Bengaluru, Sat 14 Nov 2026 at Phoenix Arena. Early bird on now: district.in/…’"
          className={cn(
            "w-full resize-y rounded-lg border bg-inset px-4 py-3 text-base text-fg placeholder:text-fg-muted focus:border-signal-ink focus:outline-none",
            inputError ? "border-urgent" : "border-line-strong",
          )}
        />
        <div className="flex justify-between text-xs text-fg-muted">
          {inputError ? (
            <p id={errorId} className="font-medium text-urgent-ink">
              {inputError}
            </p>
          ) : (
            <span>The text is sent to Google&rsquo;s Gemini API for extraction. Don&rsquo;t paste private messages.</span>
          )}
          <span className="tabular-nums">
            {text.length}/{MAX}
          </span>
        </div>
      </div>
      <TextField
        label="Where you saw it (optional)"
        type="url"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="https://…"
        hint="Stored as the source link. We never open or fetch it."
      />
      <Button onClick={submit} loading={busy} leadingIcon={<Sparkles aria-hidden className="size-4" />}>
        {busy ? "Reading announcement…" : "Extract show details"}
      </Button>

      {requestError && (
        <InlineAlert tone="error" live title="Couldn't process the announcement">
          {requestError}
        </InlineAlert>
      )}

      {outcome?.status === "extracted" && (
        <div className="space-y-3">
          <InlineAlert tone="success" live title="Added to your radar as unconfirmed">
            {outcome.dropped.length > 0 &&
              `Ignored because the text didn't clearly support it: ${[...new Set(outcome.dropped.map((d) => (d.startsWith("artist:") ? d.slice(7) : (FIELD_LABEL[d] ?? d))))].join(", ")}. `}
            {outcome.uncertainties.length > 0 && `Unclear: ${outcome.uncertainties.join("; ")}.`}
            {outcome.cached && " (Same text was read before — reused that result.)"}
          </InlineAlert>
          <div className="max-w-md">
            <EventCard
              event={outcome.event}
              location={state.location}
              detailHref={`/radar/events/${outcome.event.id}`}
              actions={<EventActions event={outcome.event} />}
            />
          </div>
        </div>
      )}

      {outcome && outcome.status !== "extracted" && (
        <InlineAlert tone={outcome.status === "not_an_event" ? "info" : "warning"} live title={outcome.message}>
          {outcome.extraction && (
            <>
              What the text said — artists: {outcome.extraction.artists.join(", ") || "none named"}; date:{" "}
              {outcome.extraction.date ?? (outcome.extraction.dateText ? `“${outcome.extraction.dateText}” (not specific enough)` : "not stated")}; venue:{" "}
              {outcome.extraction.venue ?? "not stated"}; city: {outcome.extraction.city ?? "not stated"}.
            </>
          )}
          {outcome.status === "no_matching_artist" && (
            <>
              {" "}
              <a href="/artists">Add the artist</a>, then paste it again.
            </>
          )}
        </InlineAlert>
      )}
    </section>
  );
}
