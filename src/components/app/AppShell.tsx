"use client";

import { Bell, Bookmark, ChevronDown, Compass, MapPin, Search, Settings, Ticket, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { BrandMark } from "@/components/brand/BrandMark";
import { AmbientBackdrop } from "./AmbientBackdrop";
import { SyncErrorBanner } from "./SyncErrorBanner";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { INITIAL_CITIES } from "@/domain/cities";
import { useIntegrationStatus } from "@/features/integrations/useIntegrationStatus";
import { useUnreadCount } from "@/features/notifications/useInbox";
import { useOnboarding } from "@/features/onboarding/OnboardingProvider";
import { cn } from "@/lib/cn";
import { useNow } from "@/lib/useNow";

interface NavItem {
  href: string;
  label: string;
  /** Shorter label for the mobile tab bar. */
  short?: string;
  icon: LucideIcon;
  count?: (s: ReturnType<typeof useOnboarding>["state"]) => number;
  /** Shows the server's unread-alert count instead of a local count. */
  unread?: boolean;
}

/** The primary destinations. Every one is a real route (paths unchanged). */
export const APP_NAV: NavItem[] = [
  { href: "/radar", label: "Discover", icon: Compass },
  { href: "/artists", label: "My artists", short: "Artists", icon: Users, count: (s) => s.selections.length },
  { href: "/inbox", label: "Alerts", icon: Bell, unread: true },
  { href: "/saved", label: "Saved", icon: Bookmark, count: (s) => s.savedEvents.length },
  { href: "/bookings", label: "Bookings", icon: Ticket },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Main application frame (discovery-site pattern):
 * - top header: brand, primary nav, artist search, home-city picker
 * - < lg: compact header + thumb-reachable bottom tab bar (no overflow)
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { state, hydrated, mode } = useOnboarding();
  const unread = useUnreadCount(mode, pathname);

  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <AmbientBackdrop />
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/[0.97]">
        <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center gap-3 px-4 sm:px-6 lg:gap-6 lg:px-8">
          <BrandMark className="shrink-0 max-sm:[&>span]:sr-only" />

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center gap-1">
              {APP_NAV.map((item) => {
                const active = isActive(pathname, item.href);
                const count = item.unread ? (unread ?? undefined) : hydrated && item.count ? item.count(state) : undefined;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap transition-colors",
                        active ? "bg-ink text-on-ink" : "text-fg-secondary hover:bg-surface-2 hover:text-fg",
                      )}
                    >
                      {item.label}
                      {count !== undefined && count > 0 && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[0.7rem] leading-none font-bold tabular-nums",
                            item.unread ? "bg-signal text-on-signal" : active ? "bg-on-ink/15 text-on-ink" : "bg-surface-2 text-fg-secondary",
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

          <div className="ml-auto flex min-w-0 items-center gap-2">
            <HeaderSearch />
            <CityPicker />
            <DiscoveryChip />
          </div>
        </div>
      </header>

      <main id="main" className="flex-1 pb-24 lg:pb-0">
        <SyncErrorBanner className="mx-4 mt-4 sm:mx-6 lg:mx-8" />
        {children}
      </main>

      {/* Mobile bottom tabs */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid grid-cols-6">
          {APP_NAV.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 text-[0.68rem] font-semibold transition-colors",
                    active ? "text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  <span
                    className={cn("relative grid h-7 w-11 place-items-center rounded-full transition-colors", active && "bg-signal")}
                  >
                    <Icon aria-hidden className="size-5" />
                    {item.unread && unread !== null && unread > 0 && (
                      <span className="absolute translate-x-3 -translate-y-2.5 rounded-full bg-urgent px-1 text-[0.6rem] font-bold text-ink">
                        {unread > 9 ? "9+" : unread}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </span>
                  {item.short ?? item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Artist search: hands the query to the Artists page, which runs the real MusicBrainz search. */
function HeaderSearch() {
  const router = useRouter();
  const id = useId();
  const [q, setQ] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    const query = q.trim();
    router.push(query ? `/artists?q=${encodeURIComponent(query)}#add-artists` : "/artists#add-artists");
  }
  return (
    <form role="search" onSubmit={submit} className="relative">
      <label htmlFor={id} className="sr-only">
        Search artists to follow
      </label>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-fg-muted" />
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search artists"
        className="h-11 w-11 rounded-full border border-line bg-surface pr-3 pl-10 text-sm text-fg transition-[width,border-color] placeholder:text-fg-muted focus:w-52 focus:border-fg focus:outline-none sm:w-40 sm:focus:w-56 2xl:w-56"
      />
    </form>
  );
}

/** Home city: the same preference as Settings → Location (saved through the existing preferences endpoint). */
function CityPicker() {
  const { state, run, hydrated } = useOnboarding();
  const id = useId();
  if (!hydrated) return null;
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        Home city (shows here rank first)
      </label>
      <MapPin aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-signal-ink" />
      <select
        id={id}
        value={state.location.primaryCityId}
        onChange={(e) => void run({ type: "set_primary_city", cityId: e.target.value })}
        className="h-11 max-w-[10.5rem] appearance-none truncate rounded-full border border-line bg-surface pr-8 pl-9 text-sm font-semibold text-fg transition-colors hover:border-fg-muted focus:border-fg focus:outline-none sm:max-w-none"
      >
        {INITIAL_CITIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-fg-muted" />
    </div>
  );
}

/**
 * Real discovery status from the server — never an assumed "monitoring" state.
 * "Connected" counts only sources that actually completed a check in the last
 * 48 hours; a configured key alone is not evidence that a source works.
 */
function DiscoveryChip() {
  const { status } = useIntegrationStatus();
  const now = useNow();
  const working =
    status.phase === "ready" && now
      ? status.report.eventSources.all.filter(
          (s) => s.configured && s.lastSuccessAt && now.getTime() - Date.parse(s.lastSuccessAt) < 48 * 3_600_000,
        ).length
      : 0;
  const configured = status.phase === "ready" ? status.report.eventSources.connected.length : 0;
  const content =
    status.phase === "loading" ? (
      <StatusBadge tone="in_progress" label="Checking" />
    ) : status.phase === "error" ? (
      <StatusBadge tone="failed" label="Status unknown" />
    ) : configured === 0 ? (
      <StatusBadge tone="unavailable" label="Discovery off" />
    ) : working === 0 ? (
      <StatusBadge tone="unconfirmed" label="Not checked recently" />
    ) : (
      <StatusBadge tone="confirmed" label={`${working} source${working === 1 ? "" : "s"} connected`} />
    );
  return (
    <Link href="/settings#connections" aria-label="Event discovery status" className="hidden 2xl:inline-flex">
      {content}
    </Link>
  );
}
