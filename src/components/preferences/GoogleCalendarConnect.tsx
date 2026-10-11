"use client";

import { CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useBookings } from "@/features/bookings/BookingsProvider";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { formatTimestamp } from "@/lib/format";

interface CalendarInfo {
  configured: boolean;
  reason: string | null;
  connection: { status: "connected" | "needs_reauth"; connectedAt: string } | null;
}
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

const RESULT: Record<string, { tone: "success" | "error" | "warning"; text: string }> = {
  connected: { tone: "success", text: "Google Calendar connected. Your existing bookings are being added." },
  denied: { tone: "warning", text: "Google Calendar wasn't connected — permission was declined." },
  scope_missing: { tone: "warning", text: "Calendar permission wasn't granted, so nothing was connected. Try again and allow calendar access." },
  state_mismatch: { tone: "error", text: "That sign-in couldn't be verified (it may have expired). Please try again." },
  failed: { tone: "error", text: "Google didn't complete the connection. Please try again." },
  not_configured: { tone: "warning", text: "Google Calendar isn't configured on this server yet." },
  no_profile: { tone: "warning", text: "Pick some artists first so there's a profile to connect." },
};

/** Connect / disconnect Google Calendar. "Connected" only after Google issued tokens. */
export function GoogleCalendarConnect() {
  const { mode } = useOnboarding();
  const { reload: reloadBookings } = useBookings();
  const [info, setInfo] = useState<CalendarInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [result] = useState(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("calendar")));
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (mode !== "server") return;
    let cancelled = false;
    fetch("/api/me/google-calendar", { cache: "no-store" })
      .then((r) => r.json() as Promise<Envelope<CalendarInfo>>)
      .then((b) => {
        if (cancelled) return;
        if (b.ok) setInfo(b.data);
        else setError(b.error.message);
      })
      .catch(() => !cancelled && setError("Couldn't check Google Calendar status."));
    return () => {
      cancelled = true;
    };
  }, [mode, nonce]);

  async function disconnect() {
    setBusy(true);
    try {
      const res = await fetch("/api/me/google-calendar", { method: "DELETE" });
      const b = (await res.json()) as Envelope<{ revoked: boolean }>;
      if (!b.ok) setError(b.error.message);
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
      refresh();
      reloadBookings();
    }
  }

  if (mode !== "server") return null;
  if (!info && !error) return <LoadingIndicator label="Checking Google Calendar…" />;
  const r = result ? RESULT[result] : undefined;
  const conn = info?.connection;

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <CalendarDays aria-hidden className="size-4 text-fg-muted" /> Google Calendar
        </p>
        {info && (
          <StatusBadge
            tone={!info.configured ? "unavailable" : conn?.status === "connected" ? "confirmed" : conn ? "unconfirmed" : "unknown"}
            label={!info.configured ? "Not configured" : conn?.status === "connected" ? "Connected" : conn ? "Needs reconnecting" : "Not connected"}
          />
        )}
      </div>
      {r && <InlineAlert tone={r.tone} live>{r.text}</InlineAlert>}
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {info && !info.configured && <p className="text-sm text-fg-secondary">Not configured on this server ({info.reason}).</p>}
      {info?.configured && (
        <>
          <p className="text-sm text-fg-secondary">
            {conn?.status === "connected"
              ? `Shows you book are added to your primary calendar (connected ${formatTimestamp(conn.connectedAt)}). We only ask for permission to manage events.`
              : conn
                ? "Google no longer accepts our access (it was revoked or expired). Reconnect to keep adding bookings."
                : "Add shows you book to your Google Calendar automatically. Optional — bookings work without it."}
          </p>
          <div className="flex flex-wrap gap-2">
            {conn?.status !== "connected" && (
              <a
                href="/api/integrations/google/start"
                className="inline-flex min-h-11 items-center rounded-full bg-signal px-4 text-sm font-semibold text-on-signal hover:bg-signal-hover"
              >
                {conn ? "Reconnect Google Calendar" : "Connect Google Calendar"}
              </a>
            )}
            {conn && (
              <Button variant="ghost" onClick={() => void disconnect()} loading={busy}>
                Disconnect
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
