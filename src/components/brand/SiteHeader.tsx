"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";
import { browserDraftStore } from "@/persistence/onboarding-draft-store";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { cn } from "@/lib/cn";
import { BrandMark } from "./BrandMark";

/** Only routes that exist. Add entries here as later parts ship pages. */
const NAV = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/explore", label: "Explore" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const cta = useRadarCta();

  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-canvas/85 backdrop-blur-md">
      <Container width="wide" className="flex min-h-16 items-center justify-between gap-4">
        <BrandMark />

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} active={pathname === item.href}>
              {item.label}
            </NavLink>
          ))}
          <ButtonLink href={cta.href} className="ml-3">
            {cta.label}
          </ButtonLink>
        </nav>

        <button
          type="button"
          className="grid size-11 place-items-center rounded-md text-fg hover:bg-surface md:hidden"
          aria-expanded={open}
          aria-controls={menuId}
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </button>
      </Container>

      <nav id={menuId} aria-label="Main" hidden={!open} className="border-t border-line/60 bg-canvas md:hidden">
        <Container width="wide" className="flex flex-col gap-1 py-3">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} active={pathname === item.href} onNavigate={() => setOpen(false)}>
              {item.label}
            </NavLink>
          ))}
          <ButtonLink href={cta.href} className="mt-2" onClick={() => setOpen(false)}>
            {cta.label}
          </ButtonLink>
        </Container>
      </nav>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
  onNavigate,
}: {
  href: string;
  active: boolean;
  children: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium transition-colors",
        active ? "text-fg" : "text-fg-secondary hover:bg-surface hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}

/**
 * Returning users go straight to their radar. The marketing pages sit outside
 * the radar state provider, so this reads the draft store once on mount.
 */
function hasBrowserRadar(): boolean {
  const result = browserDraftStore.load();
  return result.ok && !!result.draft && (result.draft.completedAt !== null || result.draft.selections.length > 0);
}
const noSubscribe = () => () => {};

function useRadarCta() {
  // Server render and hydration use false; the browser value is read after hydration.
  const hasRadar = useSyncExternalStore(noSubscribe, hasBrowserRadar, () => false);
  return hasRadar ? { href: "/radar", label: "Open my radar" } : { href: "/onboarding/artists", label: "Build my radar" };
}
