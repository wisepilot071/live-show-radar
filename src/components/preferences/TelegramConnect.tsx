"use client";

import { ArrowUpRight, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Switch } from "@/components/ui/Switch";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { formatTimestamp } from "@/lib/format";

interface TelegramInfo {
  configured: boolean;
  reason: string | null;
  botUsername: string | null;
  linked: boolean;
  username: string | null;
  linkedAt: string | null;
  enabled: boolean;
}
type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

/**
 * Telegram linking: "Connect" creates a single-use, 15-minute link to the bot.
 * We only show Connected after the bot actually received the user's /start
 * (checked by polling the server, not assumed).
 */
export function TelegramConnect() {
  const { mode } = useOnboarding();
  const [info, setInfo] = useState<TelegramInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (mode !== "server") return;
    let cancelled = false;
    fetch("/api/me/telegram", { cache: "no-store" })
      .then((r) => r.json() as Promise<Envelope<TelegramInfo>>)
      .then((b) => {
        if (cancelled) return;
        if (b.ok) {
          setInfo(b.data);
          if (b.data.linked) setLink(null);
        } else setError(b.error.message);
      })
      .catch(() => !cancelled && setError("Couldn't check Telegram status."));
    return () => {
      cancelled = true;
    };
  }, [mode, nonce]);

  // While a link is open, check every few seconds whether the bot received /start.
  useEffect(() => {
    if (!link) return;
    const t = setInterval(refresh, 4000);
    const stop = setTimeout(() => clearInterval(t), 15 * 60_000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [link, refresh]);

  async function act(method: "POST" | "DELETE" | "PUT", body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/telegram", {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const b = (await res.json()) as Envelope<{ url: string; expiresAt: string }>;
      if (!b.ok) setError(b.error.message);
      else if (method === "POST") {
        setLink(b.data);
        window.open(b.data.url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setBusy(false);
      refresh();
    }
  }

  if (mode !== "server") return null;
  if (!info && !error) return <LoadingIndicator label="Checking Telegram…" />;

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Send aria-hidden className="size-4 text-fg-muted" /> Telegram
        </p>
        {info && (
          <StatusBadge
            tone={!info.configured ? "unavailable" : info.linked ? "confirmed" : link ? "pending" : "unknown"}
            label={!info.configured ? "Not configured" : info.linked ? "Connected" : link ? "Waiting for Start" : "Not connected"}
          />
        )}
      </div>
      {error && <InlineAlert tone="error">{error}</InlineAlert>}
      {info && !info.configured && (
        <p className="text-sm text-fg-secondary">The Telegram bot isn&rsquo;t configured on this server ({info.reason}). Nothing is sent.</p>
      )}
      {info?.configured && !info.linked && (
        <div className="space-y-3 text-sm text-fg-secondary">
          <p>Get new-show alerts and booking confirmations in Telegram from @{info.botUsername}.</p>
          {link ? (
            <p>
              Telegram should have opened — press <strong>Start</strong> in the chat with @{info.botUsername}. This page updates once it&rsquo;s connected.{" "}
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-signal-ink underline">
                Open the link again <ArrowUpRight aria-hidden className="size-3.5" />
              </a>{" "}
              (expires {formatTimestamp(link.expiresAt)}).
            </p>
          ) : null}
          <Button onClick={() => void act("POST")} loading={busy}>
            {link ? "Create a new link" : "Connect Telegram"}
          </Button>
        </div>
      )}
      {info?.configured && info.linked && (
        <div className="space-y-3">
          <p className="text-sm text-fg-secondary">
            Connected{info.username ? ` as @${info.username}` : ""}
            {info.linkedAt ? ` since ${formatTimestamp(info.linkedAt)}` : ""}.
          </p>
          <Switch
            label="Send alerts to Telegram"
            checked={info.enabled}
            onChange={(v) => void act("PUT", { enabled: v })}
            disabled={busy}
          />
          <Button variant="ghost" onClick={() => void act("DELETE")} loading={busy}>
            Disconnect Telegram
          </Button>
        </div>
      )}
    </div>
  );
}
