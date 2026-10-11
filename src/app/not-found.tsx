import { Radar } from "lucide-react";
import { BrandMark } from "@/components/brand/BrandMark";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <Container width="narrow" className="flex min-h-dvh flex-col justify-center gap-10 py-16">
      <BrandMark />
      <main id="main">
        <EmptyState
          doodle="compass"
          icon={Radar}
          title="Nothing on the radar here"
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <ButtonLink href="/">Go home</ButtonLink>
              <ButtonLink href="/onboarding" variant="secondary">
                Continue setup
              </ButtonLink>
            </div>
          }
        >
          This page doesn&rsquo;t exist. Your setup progress is kept, so you can pick up where you left off.
        </EmptyState>
      </main>
    </Container>
  );
}
