import { ArrowUpRight, FileSearch } from "lucide-react";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { LiveEvent } from "@/domain/types";
import { formatTimestamp } from "@/lib/format";
import { VERIFICATION_EXPLAINER, VERIFICATION_TONE } from "./event-labels";

/**
 * Where an event's information came from. Shows only recorded facts: no URL
 * means no link, no timestamp means "not recorded".
 */
export function SourcePanel({ event }: { event: LiveEvent }) {
  const isExample = event.origin === "illustrative";
  const rows: Array<{ label: string; value: ReactNode }> = [
    { label: "Source", value: event.source.name },
    {
      label: "Original listing",
      value:
        event.source.url && !isExample ? (
          <a
            href={event.source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-signal-ink hover:underline"
          >
            Open at {event.source.name}
            <ArrowUpRight aria-hidden className="size-3.5" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : (
          <span className="text-fg-muted">No link recorded</span>
        ),
    },
    {
      label: "Event details last verified",
      value: event.verification.lastVerifiedAt ? (
        formatTimestamp(event.verification.lastVerifiedAt, event.when.timeZone)
      ) : (
        <span className="text-fg-muted">Not recorded</span>
      ),
    },
    {
      label: "Ticket details last verified",
      value: event.ticket.verification.lastVerifiedAt ? (
        formatTimestamp(event.ticket.verification.lastVerifiedAt, event.when.timeZone)
      ) : (
        <span className="text-fg-muted">Not recorded</span>
      ),
    },
  ];

  return (
    <section aria-labelledby="source-title" className="space-y-4 rounded-lg border border-line bg-surface p-5">
      <h2 id="source-title" className="flex items-center gap-2 font-display text-lg font-bold">
        <FileSearch aria-hidden className="size-4.5 text-fg-muted" />
        Where this comes from
      </h2>
      <dl className="divide-y divide-line/60 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2.5">
            <dt className="text-fg-secondary">{r.label}</dt>
            <dd className="text-right text-fg">{r.value}</dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-3 sm:grid-cols-2">
        <VerificationBlock label="Event details" state={event.verification.state} note={event.verification.note} />
        <VerificationBlock label="Tickets" state={event.ticket.verification.state} note={event.ticket.verification.note} />
      </div>
      {event.sources && event.sources.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-fg">
            Reported by {event.sources.length === 1 ? "1 source" : `${event.sources.length} sources`}
          </h3>
          <ul className="space-y-2">
            {event.sources.map((s) => (
              <li key={s.sourceId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line/60 bg-inset px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-fg">{s.sourceName}</span>
                  <span className="block text-xs text-fg-muted">
                    First seen {formatTimestamp(s.firstSeenAt)} · {s.lastSuccessAt ? `last confirmed ${formatTimestamp(s.lastSuccessAt)}` : "never confirmed"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusBadge tone={VERIFICATION_TONE[s.verification]} />
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1 text-xs font-medium text-signal-ink hover:underline"
                    >
                      Open
                      <ArrowUpRight aria-hidden className="size-3.5" />
                      <span className="sr-only">{s.sourceName} listing (opens in a new tab)</span>
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {event.possibleDuplicate && (
        <p className="text-xs text-fg-muted">
          Another record may describe this same show (same artist, date and city, different or unknown venue). We keep
          them separate rather than risk merging two different shows.
        </p>
      )}
    </section>
  );
}

function VerificationBlock({
  label,
  state,
  note,
}: {
  label: string;
  state: LiveEvent["verification"]["state"];
  note?: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-line/70 bg-inset p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{label}</p>
        <StatusBadge tone={VERIFICATION_TONE[state]} />
      </div>
      <p className="text-xs text-fg-muted">{note ?? VERIFICATION_EXPLAINER[state]}</p>
    </div>
  );
}
