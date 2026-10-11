import Link from "next/link";
import { Atmosphere } from "@/components/media/Atmosphere";
import { CrowdLights } from "@/components/media/CrowdLights";
import { NightSky } from "@/components/media/NightSky";
import { Container } from "@/components/ui/Container";
import { BrandMark } from "./BrandMark";

/** Footer as the end of the night: a crowd under the stars (decorative photo, stars, wristband lights). */
export function SiteFooter() {
  return (
    <footer className="on-ink relative isolate overflow-hidden bg-dusk-950 text-on-ink">
      <Atmosphere asset="panorama-band" tone="dusk" fade="bottom" className="opacity-45" />
      <NightSky dense className="opacity-70" />
      <CrowdLights className="h-20 opacity-70" />
      <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-marigold/50 to-transparent" />
      <Container width="wide" className="grid gap-10 pt-16 pb-36 md:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <BrandMark onDark />
          <p className="max-w-md text-sm leading-relaxed text-on-ink/80">
            Live Show Radar helps you keep track of concert and festival announcements in India from the artists you
            follow — with Bengaluru first, and every status labelled by how well it is verified.
          </p>
          <p className="max-w-md text-xs leading-relaxed text-on-ink/60">
            Shows are looked up from MusicBrainz, Ticketmaster and news announcements (daily, and on demand), and from
            announcements you paste. Alerts go to your in-app Inbox, and to Telegram if you connect it. The app says
            what&rsquo;s connected wherever it matters.
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
    <Link href={href} className="inline-flex min-h-11 items-center text-on-ink/70 transition-colors hover:text-marigold">
      {children}
    </Link>
  );
}
