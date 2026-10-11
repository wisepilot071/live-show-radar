import type { ReactNode } from "react";
import { AppShell } from "@/components/app/AppShell";

/** Main application: Radar, Artists, Saved shows, Settings, event details. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
