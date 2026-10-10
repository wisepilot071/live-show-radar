import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { EmptyState } from "@/components/ui/EmptyState";

export default function OnboardingNotFound() {
  return (
    <Container width="narrow" className="py-16">
      <EmptyState
        icon={Compass}
        title="That setup step doesn't exist"
        action={<ButtonLink href="/onboarding">Back to setup</ButtonLink>}
      >
        Your progress is safe. Head back and pick up where you left off.
      </EmptyState>
    </Container>
  );
}
