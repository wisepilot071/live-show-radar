import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { BrandMark } from "./BrandMark";

export function SiteFooter() {
  return (
    <footer className="border-t border-line/60 bg-inset">
      <Container width="wide" className="grid gap-10 py-12 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <BrandMark />
          <p className="max-w-md text-sm leading-relaxed text-fg-secondary">
            Live Show Radar helps you keep track of concert and festival announcements in India from the artists you
            follow — with Bengaluru first, and every status labelled by how well it is verified.
          </p>
          <p className="max-w-md text-xs leading-relaxed text-fg-muted">
            Shows are looked up from MusicBrainz (daily, and on demand) and from announcements you paste. Alerts go to
            your in-app Inbox; email isn&rsquo;t configured yet. The app says so wherever it matters.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-1 self-start text-sm">
          <FooterLink href="/">Home</FooterLink>
          <FooterLink href="/explore">Explore the preview</FooterLink>
          <FooterLink href="/#how-it-works">How it works</FooterLink>
          <FooterLink href="/onboarding/artists">Build my radar</FooterLink>
          <FooterLink href="/#transparency">What we verify</FooterLink>
        </nav>
      </Container>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center text-fg-secondary transition-colors hover:text-fg">
      {children}
    </Link>
  );
}
