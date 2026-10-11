"use client";

import { TelegramConnect } from "./TelegramConnect";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Switch } from "@/components/ui/Switch";
import { TextField } from "@/components/ui/TextField";
import { useToast } from "@/components/ui/Toast";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";

interface Channels {
  inApp: { available: boolean; enabled: boolean };
  email: {
    available: boolean;
    reason: string | null;
    enabled: boolean;
    address: string | null;
    confirmed: boolean;
    confirmationSentAt: string | null;
  };
}

const noSubscribe = () => () => {};
/** ?email=… set by the confirmation link (/api/email/confirm). */
function useEmailOutcome(): string | null {
  return useSyncExternalStore(noSubscribe, () => new URLSearchParams(window.location.search).get("email"), () => null);
}
const OUTCOME_TEXT: Record<string, { tone: "success" | "error"; text: string }> = {
  confirmed: { tone: "success", text: "Email confirmed. Alerts will now be emailed to you too." },
  "link-invalid": { tone: "error", text: "That confirmation link is invalid or expired. Send a new one below." },
  error: { tone: "error", text: "Something went wrong confirming your email. Please try the link again." },
};

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

/**
 * Delivery channels with their REAL status from the server. Nothing here can
 * mark a channel active unless the server reports it available and the
 * setting saved successfully.
 */
export function NotificationChannelList() {
  const { mode } = useOnboarding();
  const toast = useToast();
  const [channels, setChannels] = useState<Channels | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const outcome = useEmailOutcome();
  const [confirmMsgState, setConfirmMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const confirmMsg = confirmMsgState ?? (outcome ? (OUTCOME_TEXT[outcome] ?? null) : null);

  async function reload() {
    const fresh = (await (await fetch("/api/me/channels", { cache: "no-store" })).json()) as Envelope<Channels>;
    if (fresh.ok) setChannels(fresh.data);
  }

  /** Double opt-in: emails a confirmation link to the saved address. */
  async function sendConfirmation() {
    setSending(true);
    setConfirmMsg(null);
    try {
      const res = await fetch("/api/me/channels/email-confirm", { method: "POST" });
      const body = (await res.json()) as Envelope<{ sentTo?: string; alreadyConfirmed?: boolean }>;
      if (!body.ok) setConfirmMsg({ tone: "error", text: body.error.message });
      else if (body.data.alreadyConfirmed) setConfirmMsg({ tone: "success", text: "This address is already confirmed." });
      else setConfirmMsg({ tone: "success", text: `Confirmation email sent to ${body.data.sentTo}. Open the link in it to start getting alerts there.` });
      await reload();
    } catch {
      setConfirmMsg({ tone: "error", text: "Couldn't reach the server. No email was sent." });
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    if (mode !== "server") return;
    fetch("/api/me/channels", { cache: "no-store" })
      .then(async (r) => {
        const body = (await r.json()) as Envelope<Channels>;
        if (!body.ok) throw new Error(body.error.message);
        setChannels(body.data);
        setAddress(body.data.email.address ?? "");
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load channel settings."));
  }, [mode]);

  async function save(next: { inAppEnabled: boolean; emailEnabled: boolean; emailAddress: string | null }) {
    setSaving(true);
    setFieldError(null);
    try {
      const res = await fetch("/api/me/channels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const body = (await res.json()) as Envelope<{ saved: boolean }>;
      if (!body.ok) {
        setFieldError(body.error.message);
        return;
      }
      await reload();
      toast({ message: "Alert channels saved." });
    } catch {
      setFieldError("Couldn't reach the server. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "loading") return <LoadingIndicator label="Loading channels…" />;
  if (mode !== "server") {
    return (
      <InlineAlert tone="info" title="Alerts need server storage">
        This server&rsquo;s database isn&rsquo;t configured or reachable, so alerts can&rsquo;t be created or delivered. Your
        choices above are kept in this browser.
      </InlineAlert>
    );
  }
  if (error) return <InlineAlert tone="error" title="Couldn't load channel settings">{error}</InlineAlert>;
  if (!channels) return <LoadingIndicator label="Loading channels…" />;

  return (
    <div className="space-y-3">
      <Switch
        checked={channels.inApp.enabled}
        disabled={saving}
        onChange={(v) => save({ inAppEnabled: v, emailEnabled: channels.email.enabled, emailAddress: channels.email.address })}
        label="In-app inbox"
        description="Alerts appear in your Inbox with the reason for each one. Checked daily by the scheduled monitor, and whenever you press Check now."
        trailing={<StatusBadge tone={channels.inApp.enabled ? "confirmed" : "unknown"} label={channels.inApp.enabled ? "Active" : "Off"} />}
      />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-fg">Email</p>
          <StatusBadge
            tone={!channels.email.available ? "unavailable" : channels.email.enabled && channels.email.confirmed ? "confirmed" : "pending"}
            label={
              !channels.email.available
                ? "Not configured"
                : channels.email.enabled
                  ? channels.email.confirmed
                    ? "On"
                    : "Waiting for confirmation"
                  : "Off"
            }
          />
        </div>
        {!channels.email.available ? (
          <p className="text-sm text-fg-secondary">
            Email delivery is built but isn&rsquo;t configured on this server ({channels.email.reason}). No email is sent.
          </p>
        ) : (
          <>
            <p className="text-sm text-fg-secondary">
              Get alerts at any email address. We send a confirmation link first, and only email addresses whose owner
              clicked it.
            </p>
            <TextField
              label="Email address"
              type="email"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              error={fieldError ?? undefined}
              autoComplete="email"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                loading={saving}
                onClick={() => save({ inAppEnabled: channels.inApp.enabled, emailEnabled: !channels.email.enabled, emailAddress: address.trim() || null })}
              >
                {channels.email.enabled ? "Turn off email" : "Turn on email"}
              </Button>
              {channels.email.enabled && channels.email.address && !channels.email.confirmed && (
                <Button loading={sending} onClick={() => void sendConfirmation()}>
                  {channels.email.confirmationSentAt ? "Resend confirmation email" : "Send confirmation email"}
                </Button>
              )}
            </div>
            {channels.email.enabled && channels.email.confirmed && (
              <p className="text-sm font-semibold text-signal-ink">Confirmed — alerts go to {channels.email.address}.</p>
            )}
            {channels.email.enabled && !channels.email.confirmed && channels.email.confirmationSentAt && !confirmMsg && (
              <p className="text-sm text-fg-secondary">
                Confirmation email sent {new Date(channels.email.confirmationSentAt).toLocaleString("en-IN")}. Check your inbox (and spam).
              </p>
            )}
            {confirmMsg && (
              <p role="status" className={confirmMsg.tone === "error" ? "text-sm text-urgent-ink" : "text-sm text-signal-ink"}>
                {confirmMsg.text}
              </p>
            )}
          </>
        )}
      </Card>

      <TelegramConnect />
    </div>
  );
}
