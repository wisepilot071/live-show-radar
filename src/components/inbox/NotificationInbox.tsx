"use client";

import { ArrowRight, BellOff, BellRing, CalendarClock, CalendarX2, CheckCheck, Mail, Megaphone, RotateCw, Ticket, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PageHeader } from "@/components/app/PageHeader";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useInbox, type InboxNotification } from "@/features/notifications/useInbox";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { cn } from "@/lib/cn";
import { formatTimestamp, pluralize } from "@/lib/format";

const CATEGORY: Record<InboxNotification["category"], { icon: LucideIcon; label: string }> = {
  new_show: { icon: Megaphone, label: "New show" },
  ticket_update: { icon: Ticket, label: "Tickets" },
  deadline_reminder: { icon: CalendarClock, label: "Deadline" },
  event_changed: { icon: CalendarClock, label: "Changed" },
  cancelled: { icon: CalendarX2, label: "Cancelled" },
};

const EMAIL_STATUS: Record<string, string> = {
  queued: "Email queued",
  sent: "Email accepted by provider",
  failed: "Email failed — will retry",
  failed_permanent: "Email failed",
  unavailable: "Email not sent",
};

/**
 * The in-app inbox. Everything shown is a persisted notification that was
 * delivered in-app; read state and email delivery state come from the server.
 */
export function NotificationInbox() {
  const { mode } = useOnboarding();
  const { state, reload, markRead, markAllRead, setMuted } = useInbox(mode);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<string | null>, success?: string) {
    setBusy(key);
    const error = await fn();
    setBusy(null);
    if (error) toast({ message: `Couldn't update: ${error}`, tone: "info" });
    else if (success) toast({ message: success });
  }

  const unread = state.phase === "ready" ? state.unread : 0;

  return (
    <Container width="default" className="space-y-8 py-8 sm:py-12">
      <PageHeader
        eyebrow="Inbox"
        title={unread ? `${pluralize(unread, "unread alert")}` : "Your alerts"}
        description="Every alert says why you're seeing it and where the information came from."
        actions={
          state.phase === "ready" && unread > 0 ? (
            <Button variant="secondary" loading={busy === "all"} onClick={() => run("all", markAllRead, "All alerts marked as read.")} leadingIcon={<CheckCheck aria-hidden className="size-4" />}>
              Mark all read
            </Button>
          ) : undefined
        }
      />

      {state.phase === "loading" && <LoadingIndicator label="Loading your inbox…" />}

      {state.phase === "storage_off" && (
        <EmptyState icon={BellOff} title="The inbox needs server storage">
          This server&rsquo;s database isn&rsquo;t configured or reachable, so alerts can&rsquo;t be stored. Your radar still
          works in this browser.
        </EmptyState>
      )}

      {state.phase === "error" && (
        <InlineAlert
          tone="error"
          live
          title="Couldn't load your inbox"
          action={
            <Button variant="secondary" onClick={reload} leadingIcon={<RotateCw aria-hidden className="size-4" />}>
              Try again
            </Button>
          }
        >
          {state.message} This doesn&rsquo;t mean you have no alerts.
        </InlineAlert>
      )}

      {state.phase === "ready" && state.notifications.length === 0 && (
        <EmptyState icon={BellRing} title="No alerts yet" action={<ButtonLink href="/settings#alerts">Alert settings</ButtonLink>}>
          You&rsquo;ll get an alert here when a source reports a new show, a verified ticket update, an early-bird deadline,
          or a date or venue change for an artist you follow. Shows you paste in yourself don&rsquo;t create alerts.
        </EmptyState>
      )}

      {state.phase === "ready" && state.notifications.length > 0 && (
        <ul className="space-y-3" aria-label="Alerts">
          {state.notifications.map((n) => {
            const cat = CATEGORY[n.category];
            const Icon = cat.icon;
            const email = n.deliveries?.find((d) => d.channel === "email");
            const isUnread = !n.read_at;
            return (
              <li
                key={n.id}
                className={cn(
                  "rounded-xl border p-4 sm:p-5",
                  isUnread ? "border-line-strong bg-surface shadow-raised" : "border-line bg-surface-2/60",
                  n.priority === "high" && isUnread && "border-urgent/50",
                )}
              >
                <div className="flex gap-3 sm:gap-4">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-10 shrink-0 place-items-center rounded-full border",
                      n.priority === "high" ? "border-urgent/40 text-urgent-ink" : "border-line text-signal-ink",
                    )}
                  >
                    <Icon className="size-4.5" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {isUnread && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-signal-ink">
                          <span aria-hidden className="size-2 rounded-full bg-signal" /> Unread
                        </span>
                      )}
                      <StatusBadge tone="unknown" label={cat.label} />
                      {n.priority === "high" && <StatusBadge tone="urgent" label="Time-sensitive" />}
                      {n.is_test && <StatusBadge tone="example" label="Test notification" />}
                      <time dateTime={n.created_at} className="text-xs text-fg-muted">
                        {formatTimestamp(n.created_at)}
                      </time>
                    </div>
                    <h2 className="font-display text-lg leading-snug font-semibold break-words text-fg">{n.title}</h2>
                    <p className="text-sm break-words text-fg-secondary">{n.body}</p>
                    <p className="text-xs text-fg-muted">
                      <span className="font-medium text-fg-secondary">Why: </span>
                      {n.reason}
                    </p>
                    {email && (
                      <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                        <Mail aria-hidden className="size-3.5" />
                        {EMAIL_STATUS[email.status] ?? email.status}
                        {email.error && email.status !== "sent" ? ` (${email.error})` : ""}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {n.event_id && (
                        <Link
                          href={`/radar/events/${n.event_id}`}
                          onClick={() => {
                            if (isUnread) void markRead([n.id]);
                          }}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-4 text-sm font-semibold text-on-ink hover:bg-ink/90"
                        >
                          View show <ArrowRight aria-hidden className="size-4" />
                        </Link>
                      )}
                      {isUnread && (
                        <Button variant="ghost" loading={busy === `r:${n.id}`} onClick={() => run(`r:${n.id}`, () => markRead([n.id]))}>
                          Mark read
                        </Button>
                      )}
                      {n.event_id && (
                        <Button
                          variant="ghost"
                          loading={busy === `m:${n.id}`}
                          aria-pressed={n.muted}
                          onClick={() =>
                            run(`m:${n.id}`, () => setMuted(n.event_id!, !n.muted), n.muted ? "You'll get alerts about this show again." : "Muted — no more alerts about this show.")
                          }
                        >
                          {n.muted ? "Unmute show" : "Mute this show"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Container>
  );
}
