"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LiveEvent } from "@/domain/types";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";

export type CalendarStatus = "not_connected" | "pending" | "synced" | "failed" | "needs_reauth";

export interface ClientBooking {
  id: string;
  eventId: string;
  status: "user_confirmed" | "provider_verified";
  confirmedAt: string;
  calendar: { status: CalendarStatus; htmlLink: string | null; error: string | null; syncedAt: string | null; attempts: number };
  event: LiveEvent | null;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { message: string } };
export type ActionResult = { ok: true; message: string; booking?: ClientBooking } | { ok: false; message: string };

interface BookingsValue {
  /** "storage_off" in browser mode: bookings need server storage. */
  phase: "loading" | "ready" | "error" | "storage_off";
  bookings: ClientBooking[];
  byEventId: Map<string, ClientBooking>;
  error: string | null;
  confirm: (eventId: string) => Promise<ActionResult>;
  retryCalendar: (bookingId: string) => Promise<ActionResult>;
  remove: (bookingId: string) => Promise<ActionResult>;
  reload: () => void;
}

const Ctx = createContext<BookingsValue | null>(null);

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
    const body = (await res.json()) as Envelope<T>;
    return body.ok ? { ok: true, data: body.data } : { ok: false, message: body.error.message };
  } catch {
    return { ok: false, message: "Couldn't reach the server. Nothing was changed." };
  }
}

/** The profile's bookings, loaded once per page and shared by every booking button. */
export function BookingsProvider({ children }: { children: ReactNode }) {
  const { mode } = useOnboarding();
  const [fetched, setFetched] = useState<{ ok: true; bookings: ClientBooking[] } | { ok: false; message: string } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (mode !== "server") return;
    let cancelled = false;
    void call<{ bookings: ClientBooking[] }>("/api/me/bookings").then((r) => {
      if (!cancelled) setFetched(r.ok ? { ok: true, bookings: r.data.bookings } : { ok: false, message: r.message });
    });
    return () => {
      cancelled = true;
    };
  }, [mode, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const value = useMemo<BookingsValue>(() => {
    const bookings = fetched?.ok ? fetched.bookings : [];
    const phase: BookingsValue["phase"] =
      mode === "loading" ? "loading" : mode !== "server" ? "storage_off" : !fetched ? "loading" : fetched.ok ? "ready" : "error";
    const upsert = (b: ClientBooking) =>
      setFetched((f) => ({ ok: true, bookings: [b, ...(f?.ok ? f.bookings.filter((x) => x.id !== b.id) : [])] }));
    return {
      phase,
      bookings,
      byEventId: new Map(bookings.map((b) => [b.eventId, b])),
      error: fetched && !fetched.ok ? fetched.message : null,
      confirm: async (eventId) => {
        const r = await call<{ booking: ClientBooking; message: string }>("/api/me/bookings", {
          method: "POST",
          body: JSON.stringify({ eventId }),
        });
        if (!r.ok) return r;
        upsert(r.data.booking);
        return { ok: true, message: r.data.message, booking: r.data.booking };
      },
      retryCalendar: async (bookingId) => {
        const r = await call<{ booking: ClientBooking; message: string }>(`/api/me/bookings/${bookingId}/calendar`, { method: "POST" });
        if (!r.ok) return r;
        upsert(r.data.booking);
        return { ok: true, message: r.data.message, booking: r.data.booking };
      },
      remove: async (bookingId) => {
        const r = await call<{ calendarRemoved: boolean | null }>(`/api/me/bookings/${bookingId}`, { method: "DELETE" });
        if (!r.ok) return r;
        setFetched((f) => (f?.ok ? { ok: true, bookings: f.bookings.filter((b) => b.id !== bookingId) } : f));
        return {
          ok: true,
          message:
            r.data.calendarRemoved === false
              ? "Booking removed. Its Google Calendar event couldn't be removed — delete it in Google Calendar if needed."
              : "Booking removed.",
        };
      },
      reload,
    };
  }, [fetched, mode, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Like useBookings, but null outside the provider (e.g. the marketing pages). */
export function useOptionalBookings(): BookingsValue | null {
  return useContext(Ctx);
}

export function useBookings(): BookingsValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBookings must be used inside <BookingsProvider>");
  return ctx;
}
