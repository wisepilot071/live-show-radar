"use client";

import { CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * The single feedback pattern for completed user actions (save, unsave, add,
 * remove). One toast at a time; an optional Undo. Announced politely to
 * screen readers. Errors that need attention stay inline, not in toasts.
 */
interface ToastInput {
  message: string;
  tone?: "success" | "info";
  action?: { label: string; onAction: () => void };
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);
const DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const counter = useRef(0);

  const show = useCallback((t: ToastInput) => {
    counter.current += 1;
    setToast({ ...t, id: counter.current });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const Icon = toast?.tone === "info" ? Info : CheckCircle2;

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex justify-center px-4 md:bottom-6"
      >
        {toast && (
          <div
            key={toast.id}
            className="pointer-events-auto flex w-full max-w-md animate-rise items-center gap-3 rounded-lg border border-line-strong bg-surface py-2 pr-2 pl-4 text-sm shadow-raised"
          >
            <Icon aria-hidden className={cn("size-4.5 shrink-0", toast.tone === "info" ? "text-info" : "text-success")} />
            <p className="min-w-0 flex-1 text-fg">{toast.message}</p>
            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onAction();
                  setToast(null);
                }}
                className="min-h-11 shrink-0 rounded-md px-3 font-semibold text-signal-ink hover:bg-surface-2"
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToast(null)}
              className="grid size-11 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
