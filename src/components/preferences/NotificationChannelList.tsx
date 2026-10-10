"use client";

import { useEffect, useState } from "react";
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
  email: { available: boolean; reason: string | null; enabled: boolean; address: string | null; addressAllowed: boolean | null };
}

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
      const fresh = (await (await fetch("/api/me/channels", { cache: "no-store" })).json()) as Envelope<Channels>;
      if (fresh.ok) setChannels(fresh.data);
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
            tone={!channels.email.available ? "unavailable" : channels.email.enabled && channels.email.addressAllowed ? "confirmed" : "pending"}
            label={
              !channels.email.available
                ? "Not configured"
                : channels.email.enabled
                  ? channels.email.addressAllowed
                    ? "On"
                    : "Address not allowed"
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
              Until address verification exists, email only goes to addresses the operator has allow-listed.
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
            </div>
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-fg">Telegram</p>
          <p className="text-sm text-fg-secondary">Not built. Nothing is sent.</p>
        </div>
        <StatusBadge tone="unavailable" />
      </Card>
    </div>
  );
}
