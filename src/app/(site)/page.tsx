import { ArrowRight } from "lucide-react";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Atmosphere } from "@/components/media/Atmosphere";
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
      <section aria-labelledby="cta-title" className="py-12 lg:py-16">
        <Container width="wide">
          <div className="on-ink relative isolate flex flex-col items-start gap-6 overflow-hidden rounded-[1.75rem] bg-ink px-6 py-14 text-on-ink shadow-[0_30px_70px_-40px_rgb(32_40_32/0.7)] sm:px-10 md:flex-row md:items-end md:justify-between lg:px-14 lg:py-20">
            <Atmosphere asset="gold-stage" />
            <h2
              id="cta-title"
              className="max-w-2xl font-display text-4xl leading-[1.02] font-bold tracking-tight text-balance drop-shadow-[0_2px_18px_rgb(0_0_0/0.35)] sm:text-5xl"
            >
              Stop finding out after the early-bird is gone.
            </h2>
            <ButtonLink
              href="/onboarding/artists"
              size="lg"
              trailingIcon={<ArrowRight aria-hidden className="size-5" />}
            >
              Build my music radar
            </ButtonLink>
          </div>
        </Container>
      </section>
    </>
  );
}
