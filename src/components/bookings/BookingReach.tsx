"use client";

import { CalendarDays, Check, Mail, Send, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { clientFetch } from "@/lib/client-fetch";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };
interface Reach {
  calendar: "connected" | "needs_reauth" | "off" | "unavailable";
  email: { on: boolean; confirmed: boolean; address: string | null } | null;
  telegram: boolean | null;
}

async function get<T>(url: string): Promise<T | null> {
  try {
    const b = (await (await clientFetch(url, { cache: "no-store" })).json()) as Envelope<T>;
    return b.ok ? b.data : null;
  } catch {
    return null;
  }
}

/**
 * Before confirming a booking: where the confirmation will actually go FROM THIS
 * DEVICE'S profile (each browser has its own until Google is connected), with
 * one-tap fixes for anything missing. Real statuses from the server only.
 */
export function BookingReach() {
  const [reach, setReach] = useState<Reach | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      get<{ configured: boolean; connection: { status: string } | null }>("/api/me/google-calendar"),
      get<{ email: { available: boolean; enabled: boolean; address: string | null; confirmed: boolean } }>("/api/me/channels"),
      get<{ configured: boolean; linked: boolean }>("/api/me/telegram"),
    ]).then(([cal, ch, tg]) => {
      if (cancelled) return;
      setReach({
        calendar: !cal?.configured ? "unavailable" : cal.connection?.status === "connected" ? "connected" : cal.connection ? "needs_reauth" : "off",
        email: ch?.email.available ? { on: ch.email.enabled, confirmed: ch.email.confirmed, address: ch.email.address } : null,
        telegram: tg?.configured ? tg.linked : null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!reach) return <p className="text-xs text-fg-muted">Checking where your confirmation will go…</p>;
  const emailOk = Boolean(reach.email?.on && reach.email.confirmed);
  const anyMissing = reach.calendar !== "connected" || !emailOk;

  return (
    <div className="space-y-2 rounded-xl border border-line bg-inset/70 p-3">
      <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">On this device</p>
      <ul className="space-y-1.5 text-sm">
        <Row
          ok={reach.calendar === "connected"}
          icon={<CalendarDays aria-hidden className="size-4" />}
          label={
            reach.calendar === "connected"
              ? "Added to your Google Calendar"
              : reach.calendar === "needs_reauth"
                ? "Google Calendar needs reconnecting"
                : reach.calendar === "unavailable"
                  ? "Google Calendar isn't available on this server"
                  : "Google Calendar not connected"
          }
          action={
            reach.calendar === "off" || reach.calendar === "needs_reauth" ? (
              <a href="/api/integrations/google/start" className="font-semibold text-signal-ink underline underline-offset-2">
                {reach.calendar === "off" ? "Connect" : "Reconnect"}
              </a>
            ) : null
          }
        />
        <Row
          ok={emailOk}
          icon={<Mail aria-hidden className="size-4" />}
          label={
            emailOk
              ? `Email confirmation to ${reach.email!.address}`
              : reach.email?.on && !reach.email.confirmed
                ? "Email address not confirmed yet"
                : reach.email
                  ? "No email set for this device"
                  : "Email isn't available on this server"
          }
          action={reach.email && !emailOk ? <Link href="/settings#alerts" className="font-semibold text-signal-ink underline underline-offset-2">Set up</Link> : null}
        />
        {reach.telegram !== null && (
          <Row
            ok={reach.telegram}
            icon={<Send aria-hidden className="size-4" />}
            label={reach.telegram ? "Telegram confirmation" : "Telegram not connected"}
            action={reach.telegram ? null : <Link href="/settings#alerts" className="font-semibold text-signal-ink underline underline-offset-2">Connect</Link>}
          />
        )}
      </ul>
      {anyMissing && (
        <p className="text-xs text-fg-muted">
          Booked on another device before? Connect Google here with the same account — this device will switch to your existing radar.
        </p>
      )}
    </div>
  );
}

function Row({ ok, icon, label, action }: { ok: boolean; icon: React.ReactNode; label: string; action: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span className={ok ? "text-signal-ink" : "text-fg-muted"}>{icon}</span>
      <span className={ok ? "text-fg" : "text-fg-secondary"}>{label}</span>
      {ok ? <Check aria-hidden className="size-4 text-signal-ink" /> : <X aria-hidden className="size-4 text-fg-muted" />}
      {action && <span className="ml-auto">{action}</span>}
    </li>
  );
}
