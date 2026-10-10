import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";
import { ToastProvider } from "@/components/ui/Toast";

/** Main application: Radar, Artists, Saved shows, Settings, event details. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AppShell>{children}</AppShell>
    </ToastProvider>
  );
}
