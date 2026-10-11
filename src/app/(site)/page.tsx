import { ArrowRight } from "lucide-react";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { ProductPreview } from "@/components/landing/ProductPreview";
import { RadarHero } from "@/components/landing/RadarHero";
import { TrustSection } from "@/components/landing/TrustSection";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";

export default function LandingPage() {
  return (
    <>
      <RadarHero />
      <ProductPreview />
      <HowItWorks />
      <TrustSection />
      <section aria-labelledby="cta-title" className="border-t border-line/60">
        <Container width="wide" className="flex flex-col items-start gap-6 py-16 md:flex-row md:items-end md:justify-between lg:py-20">
          <h2 id="cta-title" className="max-w-2xl font-display text-4xl leading-[1.02] font-bold tracking-tight text-balance sm:text-5xl">
            Stop finding out after the early-bird is gone.
          </h2>
          <ButtonLink href="/onboarding/artists" size="lg" trailingIcon={<ArrowRight aria-hidden className="size-5" />}>
            Build my music radar
          </ButtonLink>
        </Container>
      </section>
    </>
  );
}
