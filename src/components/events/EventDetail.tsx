"use client";

import { ArrowLeft, ArrowUpRight, CalendarDays, CalendarX2, Clock, MapPin, Megaphone, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { findIllustrativeEvent } from "@/data/illustrative-events";
import { artistIdentityKey } from "@/domain/artist-identity";
import { deriveEventSignals } from "@/domain/event-signals";
import type { LiveEvent } from "@/domain/types";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { cn } from "@/lib/cn";
import { formatEventDate, formatTimestamp, hostLabel } from "@/lib/format";
import { useNow } from "@/lib/useNow";
import { cardVariant, relevanceLine, TICKET_STATUS_LABEL, VARIANT_TAG, VERIFICATION_TONE } from "./event-labels";
import { EventActions } from "./EventActions";
import { SourcePanel } from "./SourcePanel";
import { DetailSkeleton } from "@/components/ui/Skeletons";
import { clientFetch } from "@/lib/client-fetch";

type Canonical =
  | { phase: "skip" } // not a stored-event id
  | { phase: "loading" }
  | { phase: "ready"; event: LiveEvent }
  | { phase: "not_found" }
  | { phase: "error"; message: string };

/** Loads a stored event by id. Missing ≠ failed: the two states stay distinct. */
function useCanonicalEvent(id: string): Canonical {
  const isStored = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
  const [result, setResult] = useState<Canonical>(isStored ? { phase: "loading" } : { phase: "skip" });
  useEffect(() => {
    if (!isStored) return;
    const controller = new AbortController();
    clientFetch(`/api/events/${id}`, { signal: controller.signal, cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as { ok: true; data: { event: LiveEvent } } | { ok: false; error: { code: string; message: string } };
        if (body.ok) setResult({ phase: "ready", event: body.data.event });
        else if (body.error.code === "not_found") setResult({ phase: "not_found" });
        else setResult({ phase: "error", message: body.error.message });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ phase: "error", message: "Couldn't reach the server." });
      });
    return () => controller.abort();
  }, [id, isStored]);
  return result;
}

/**
 * Event details. Resolution order:
 *   1. the stored canonical event (live data, with all source evidence)
 *   2. a saved snapshot — used if the event can't be loaded, and labelled so
 *   3. the illustrative set (labelled as examples)
 * An unknown id gets an honest "not found" rather than a guess.
 */
export function EventDetail({ id }: { id: string }) {
  const router = useRouter();
  const { state, hydrated } = useOnboarding();
  const now = useNow();
  const canonical = useCanonicalEvent(id);

  if (!hydrated || canonical.phase === "loading") {
    return (
      <Container className="py-12">
        <DetailSkeleton label="Loading show…" />
      </Container>
    );
  }

  const saved = state.savedEvents.find((s) => s.eventId === id);
  const event: LiveEvent | undefined =
    canonical.phase === "ready" ? canonical.event : (saved?.snapshot ?? findIllustrativeEvent(id));
  const showingSnapshot = canonical.phase !== "ready" && canonical.phase !== "skip" && Boolean(saved);

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/radar");
  }

  const back = (
    <Button variant="ghost" onClick={goBack} leadingIcon={<ArrowLeft aria-hidden className="size-4" />} className="-ml-3">
      Back
    </Button>
  );

  if (!event) {
    return (
      <Container width="narrow" className="space-y-6 py-8 sm:py-12">
        {back}
        <EmptyState
          icon={CalendarX2}
          title={canonical.phase === "error" ? "We couldn't load this show" : "We can't find this show"}
          action={<ButtonLink href="/radar">Go to your radar</ButtonLink>}
        >
          {canonical.phase === "error"
            ? `${canonical.message} This doesn't mean the show was removed — try again in a moment.`
            : "It isn't in our event records or your Saved shows. If you followed an old link, the show may have been removed."}
        </EmptyState>
      </Container>
    );
  }

  const signals = now ? deriveEventSignals(event, now, state.location) : null;
  const variant = signals ? cardVariant(signals) : "standard";
  const tag = variant !== "standard" ? VARIANT_TAG[variant] : null;
  const isExample = event.origin === "illustrative";
  const ticket = event.ticket;
  const ticketConfirmed = ticket.verification.state === "confirmed";
  const canBook = !isExample && Boolean(ticket.bookingUrl);
  const followed = state.selections.filter((s) => event.artistIds.includes(s.artist.id));

  return (
    <Container width="default" className="space-y-8 py-8 sm:py-12">
      {back}

      {isExample && (
        <InlineAlert tone="warning" title="Illustrative preview — not live concert data">
          This show, its artist and its venue are fictional. They demonstrate how event details are presented.
        </InlineAlert>
      )}
      {showingSnapshot && saved && (
        <InlineAlert tone="warning" title="Showing the copy you saved">
          {canonical.phase === "not_found"
            ? "This show is no longer in our event records (a source may have removed it). "
            : "We couldn't load the latest details right now. "}
          These are the details as of {formatTimestamp(saved.savedAt)}, when you saved it.
        </InlineAlert>
      )}
      {event.origin === "user_submitted" && (
        <InlineAlert tone="info" title="From an announcement you pasted">
          Gemini extracted these details from text you supplied. No other source has confirmed this show yet, so treat it
          as unconfirmed.
        </InlineAlert>
      )}

      {/* Overview */}
      <header className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {isExample && <StatusBadge tone="example" label="Example · not real" />}
          {tag && <StatusBadge tone={tag.tone} label={tag.label} />}
          <StatusBadge tone={VERIFICATION_TONE[event.verification.state]} />
        </div>
        <p className="text-sm font-medium text-fg-muted">
          {event.kind === "festival" ? "Festival" : event.kind === "tour_stop" ? "Tour stop" : "Concert"}
        </p>
        <h1
          className={cn(
            "font-display text-[clamp(2.2rem,6vw,4rem)] leading-[0.98] font-extrabold tracking-tight break-words",
            signals?.cancelled && "line-through decoration-urgent/70",
          )}
        >
          {event.artistNames.join(", ")}
        </h1>
        <p className="text-lg text-fg-secondary">{event.title}</p>
        {signals && (
          <p className={cn("text-sm", signals.locality === "primary" ? "font-medium text-signal-ink" : "text-fg-secondary")}>
            {relevanceLine(event, signals, state.location.primaryCityId)}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <EventActions event={event} />
          {canBook && ticket.bookingUrl && (
            <a
              href={ticket.bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-signal px-4 text-sm font-semibold text-on-signal hover:bg-signal-hover"
            >
              Ticket page on {hostLabel(ticket.bookingUrl)}
              <ArrowUpRight aria-hidden className="size-4" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          )}
        </div>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <section aria-labelledby="when-title" className="rounded-xl border border-line bg-surface shadow-card p-5">
            <h2 id="when-title" className="mb-3 font-display text-lg font-bold">
              When and where
            </h2>
            <dl className="space-y-3 text-sm">
              <DetailRow icon={CalendarDays} label="Date and time">
                {event.when.date || event.when.startsAt ? (
                  <>
                    {formatEventDate(event.when)}
                    <span className="block text-xs text-fg-muted">
                      {event.when.startsAt ? `Venue time (${event.when.timeZone})` : "Start time not announced"}
                    </span>
                  </>
                ) : (
                  <span className="text-fg-muted italic">Date not announced</span>
                )}
              </DetailRow>
              <DetailRow icon={MapPin} label="Venue">
                {event.venueName ?? <span className="text-fg-muted italic">Venue not announced</span>}
                <span className="block text-fg-secondary">
                  {event.cityName}, {event.countryCode === "IN" ? "India" : event.countryCode}
                </span>
              </DetailRow>
              <DetailRow icon={Megaphone} label="Announced">
                {event.announcedAt ? (
                  formatTimestamp(event.announcedAt, event.when.timeZone)
                ) : (
                  <span className="text-fg-muted">Announcement time not recorded</span>
                )}
              </DetailRow>
            </dl>
          </section>

          <section
            aria-labelledby="tickets-title"
            className={cn("rounded-lg border bg-surface p-5", variant === "deadline" ? "border-urgent/50" : "border-line")}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="tickets-title" className="flex items-center gap-2 font-display text-lg font-bold">
                <Ticket aria-hidden className="size-4.5 text-fg-muted" />
                Tickets
              </h2>
              <StatusBadge tone={VERIFICATION_TONE[ticket.verification.state]} />
            </div>
            <dl className="space-y-3 text-sm">
              <DetailRow icon={Ticket} label="Status">
                {ticket.verification.state === "unavailable"
                  ? "Ticket source couldn't be checked"
                  : ticketConfirmed || ticket.kind === "unknown"
                    ? TICKET_STATUS_LABEL[ticket.kind]
                    : `${TICKET_STATUS_LABEL[ticket.kind]} — not verified`}
              </DetailRow>
              <DetailRow icon={Clock} label="Early-bird deadline">
                {ticketConfirmed && ticket.earlyBirdEndsAt ? (
                  <span className={variant === "deadline" ? "font-semibold text-urgent-ink" : undefined}>
                    {formatTimestamp(ticket.earlyBirdEndsAt, event.when.timeZone)}
                    {signals?.deadlinePassed && " (passed)"}
                  </span>
                ) : (
                  <span className="text-fg-muted">No verified deadline</span>
                )}
              </DetailRow>
              <DetailRow icon={CalendarDays} label="General sale opens">
                {ticket.saleOpensAt ? (
                  <>
                    {formatTimestamp(ticket.saleOpensAt, event.when.timeZone)}
                    {!ticketConfirmed && <span className="text-fg-muted"> — reported by {event.source.name}, not verified</span>}
                  </>
                ) : (
                  <span className="text-fg-muted">Not stated by the source</span>
                )}
              </DetailRow>
            </dl>
            {!canBook && (
              <p className="mt-4 border-t border-line/60 pt-3 text-sm text-fg-muted">
                {isExample ? "No ticket link — this is an example." : "No verified ticket link yet, so we don't show one."}
              </p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <SourcePanel event={event} />
          <section aria-labelledby="artists-title" className="space-y-3 rounded-xl border border-line bg-surface shadow-card p-5">
            <h2 id="artists-title" className="flex items-center gap-2 font-display text-lg font-bold">
              <Users aria-hidden className="size-4.5 text-fg-muted" />
              Artists
            </h2>
            {followed.length > 0 ? (
              <ul className="space-y-2">
                {followed.map((s) => (
                  <li key={artistIdentityKey(s.artist)}>
                    <Link
                      href={`/artists?focus=${encodeURIComponent(artistIdentityKey(s.artist))}`}
                      className="inline-flex min-h-11 items-center gap-1.5 font-medium text-fg hover:text-signal-ink"
                    >
                      {s.artist.name} — in your artists
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-fg-secondary">
                {isExample
                  ? "Fictional artist — not in any catalogue."
                  : "None of this show's artists are in your list."}
              </p>
            )}
          </section>
        </div>
      </div>
    </Container>
  );
}

function DetailRow({ icon: Icon, label, children }: { icon: typeof Ticket; label: string; children: ReactNode }) {
  return (
    // A <dl> group may only contain <dt>/<dd>, so the icon lives inside the <dt>.
    <div className="relative min-w-0 pl-7">
      <dt className="text-xs text-fg-muted">
        <Icon aria-hidden className="absolute top-0.5 left-0 size-4 text-fg-muted" />
        {label}
      </dt>
      <dd className="break-words text-fg">{children}</dd>
    </div>
  );
}
