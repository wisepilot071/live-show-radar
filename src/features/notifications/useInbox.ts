"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProfileMode } from "@/features/onboarding/OnboardingProvider";
import { clientFetch } from "@/lib/client-fetch";

export interface InboxNotification {
  id: string;
  event_id: string | null;
  category: "new_show" | "ticket_update" | "deadline_reminder" | "event_changed" | "cancelled" | "booking_confirmed";
  priority: "high" | "normal";
  title: string;
  body: string;
  reason: string;
  created_at: string;
  read_at: string | null;
  is_test: boolean;
  muted: boolean;
  /** From the stored show snapshot (null for alerts without a show). */
  artist: string | null;
  city: string | null;
  event_date: string | null;
  deliveries: Array<{ channel: "in_app" | "email"; status: string; sentAt: string | null; error: string | null }> | null;
}

export type InboxState =
  | { phase: "loading" }
  | { phase: "storage_off" }
  | { phase: "ready"; notifications: InboxNotification[]; unread: number }
  | { phase: "error"; message: string };

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };

/** Fired after the inbox changes so the nav badge can refresh. */
export const INBOX_CHANGED = "lsr:inbox-changed";

type InboxFetched = { key: number } & ({ ok: true; notifications: InboxNotification[]; unread: number } | { ok: false; message: string });

export function useInbox(mode: ProfileMode) {
  const [fetched, setFetched] = useState<InboxFetched | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (mode !== "server") return;
    const controller = new AbortController();
    clientFetch("/api/me/notifications", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as Envelope<{ notifications: InboxNotification[]; unread: number }>;
        if (!body.ok) throw new Error(body.error.message);
        setFetched({ key: nonce, ok: true, ...body.data });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setFetched({ key: nonce, ok: false, message: err instanceof Error ? err.message : "Couldn't load your inbox." });
      });
    return () => controller.abort();
  }, [mode, nonce]);

  // Derived: storage-off and loading are never stored.
  const state: InboxState =
    mode === "loading"
      ? { phase: "loading" }
      : mode !== "server"
        ? { phase: "storage_off" }
        : !fetched
          ? { phase: "loading" }
          : fetched.ok
            ? { phase: "ready", notifications: fetched.notifications, unread: fetched.unread }
            : { phase: "error", message: fetched.message };

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  /** Calls an inbox mutation; reloads from the server whatever the outcome so the UI never shows unsaved state. */
  const mutate = useCallback(
    async (url: string, body: unknown): Promise<string | null> => {
      try {
        const res = await clientFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const json = (await res.json()) as Envelope<unknown>;
        return json.ok ? null : json.error.message;
      } catch {
        return "Couldn't reach the server.";
      } finally {
        reload();
        window.dispatchEvent(new Event(INBOX_CHANGED));
      }
    },
    [reload],
  );

  return {
    state,
    reload,
    markRead: (ids: string[]) => mutate("/api/me/notifications/read", { ids }),
    markAllRead: () => mutate("/api/me/notifications/read", { all: true }),
    setMuted: (eventId: string, muted: boolean) => mutate("/api/me/notifications/mute", { eventId, muted }),
  };
}

/** Unread count for the nav badge (real count from the server; nothing in browser mode). */
export function useUnreadCount(mode: ProfileMode, pathname: string): number | null {
  const [count, setCount] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    const bump = () => setNonce((n) => n + 1);
    window.addEventListener(INBOX_CHANGED, bump);
    window.addEventListener("focus", bump);
    return () => {
      window.removeEventListener(INBOX_CHANGED, bump);
      window.removeEventListener("focus", bump);
    };
  }, []);
  useEffect(() => {
    if (mode !== "server") return;
    const controller = new AbortController();
    clientFetch("/api/me/notifications", { cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as Envelope<{ unread: number }>;
        setCount(body.ok ? body.data.unread : null);
      })
      .catch(() => {
        if (!controller.signal.aborted) setCount(null);
      });
    return () => controller.abort();
  }, [mode, pathname, nonce]);
  return mode === "server" ? count : null;
}
