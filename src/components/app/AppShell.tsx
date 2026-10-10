"use client";

import { Bell, Bookmark, Radar, Settings, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { SyncErrorBanner } from "./SyncErrorBanner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useIntegrationStatus } from "@/features/integrations/useIntegrationStatus";
import { useUnreadCount } from "@/features/notifications/useInbox";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: (s: ReturnType<typeof useOnboarding>["state"]) => number;
  /** Shows the server's unread-alert count instead of a local count. */
  unread?: boolean;
}

/** The primary destinations. Every one is a real route. */
export const APP_NAV: NavItem[] = [
  { href: "/radar", label: "Radar", icon: Radar },
  { href: "/inbox", label: "Inbox", icon: Bell, unread: true },
  { href: "/artists", label: "Artists", icon: Users, count: (s) => s.selections.length },
  { href: "/saved", label: "Saved shows", icon: Bookmark, count: (s) => s.savedEvents.length },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Main application frame.
 * - ≥ lg: fixed left sidebar with brand, nav, and the real discovery status
 * - < lg: compact top bar + bottom tab bar (thumb-reachable, no overflow)
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, hydrated, mode } = useOnboarding();
  const unread = useUnreadCount(mode, pathname);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r border-line/60 bg-inset px-4 py-5 lg:flex">
        <BrandMark className="px-2" />
        <nav aria-label="Main">
          <ul className="space-y-1">
            {APP_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              const count = item.unread ? (unread ?? undefined) : hydrated && item.count ? item.count(state) : undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                      active ? "bg-surface text-fg" : "text-fg-secondary hover:bg-surface/60 hover:text-fg",
                    )}
                  >
                    {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-signal" />}
                    <Icon aria-hidden className={cn("size-4.5", active ? "text-signal" : "text-fg-muted group-hover:text-fg")} />
                    <span className="flex-1">{item.label}</span>
                    {count !== undefined && count > 0 && (
                      <span
                        className={cn(
                          "font-mono text-xs tabular-nums",
                          item.unread ? "rounded-full bg-signal px-1.5 py-0.5 font-semibold text-on-signal" : "text-fg-muted",
                        )}
                      >
                        {count}
                        <span className="sr-only">{item.unread ? " unread" : " items"}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="mt-auto">
          <DiscoveryChip />
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-line/60 bg-canvas/90 px-4 backdrop-blur-md lg:hidden">
          <BrandMark />
          <DiscoveryChip compact />
        </header>

        <main id="main" className="flex-1 pb-24 lg:pb-0">
          <SyncErrorBanner className="mx-4 mt-4 sm:mx-6 lg:mx-8" />
          {children}
        </main>

        {/* Mobile bottom tabs */}
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
        >
          <ul className="grid grid-cols-5">
            {APP_NAV.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex min-h-16 flex-col items-center justify-center gap-1 text-[0.72rem] font-medium transition-colors",
                      active ? "text-fg" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    <span
                      className={cn(
                        "relative grid h-7 w-12 place-items-center rounded-full transition-colors",
                        active && "bg-signal/15",
                      )}
                    >
                      <Icon aria-hidden className={cn("size-5", active && "text-signal")} />
                      {item.unread && unread !== null && unread > 0 && (
                        <span className="absolute translate-x-3 -translate-y-2.5 rounded-full bg-signal px-1 font-mono text-[0.6rem] font-semibold text-on-signal">
                          {unread > 9 ? "9+" : unread}
                          <span className="sr-only"> unread</span>
                        </span>
                      )}
                    </span>
                    {item.label === "Saved shows" ? "Saved" : item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}

/** Real discovery status from the server — never an assumed "monitoring" state. */
function DiscoveryChip({ compact }: { compact?: boolean }) {
  const { status } = useIntegrationStatus();
  const content =
    status.phase === "loading" ? (
      <StatusBadge tone="in_progress" label="Checking" />
    ) : status.phase === "error" ? (
      <StatusBadge tone="failed" label="Status unknown" />
    ) : status.report.eventSources.connected.length === 0 ? (
      <StatusBadge tone="unavailable" label={compact ? "Discovery off" : "Not connected"} />
    ) : (
      <StatusBadge tone="confirmed" label={`${status.report.eventSources.connected.length} source${status.report.eventSources.connected.length === 1 ? "" : "s"}`} />
    );

  if (compact) return <Link href="/settings#connections" aria-label="Event discovery status">{content}</Link>;
  return (
    <Link
      href="/settings#connections"
      className="block space-y-2 rounded-lg border border-line/70 bg-surface p-3 transition-colors hover:border-line-strong"
    >
      <span className="block font-mono text-[0.7rem] tracking-wide text-fg-muted uppercase">Event discovery</span>
      {content}
    </Link>
  );
}
