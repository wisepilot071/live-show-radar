import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { BookingsProvider } from "@/features/bookings/BookingsProvider";
import { OnboardingProvider } from "@/features/onboarding/OnboardingProvider";

/**
 * Everything that reads or writes the user's radar configuration lives under
 * this group, so one provider owns that state for onboarding and /radar.
 * Toasts are provided here too: onboarding steps reuse components that use them.
 */
export default function JourneyLayout({ children }: { children: ReactNode }) {
  return (
    <OnboardingProvider>
      <BookingsProvider>
        <ToastProvider>{children}</ToastProvider>
      </BookingsProvider>
    </OnboardingProvider>
  );
}
