import { Suspense } from "react";
import { ArtistSearchStep } from "@/components/onboarding/ArtistSearchStep";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";

export default function ArtistsPage() {
  // useSearchParams (for ?q=) needs a Suspense boundary.
  return (
    <Suspense fallback={<LoadingIndicator label="Loading artist search…" className="p-8" />}>
      <ArtistSearchStep />
    </Suspense>
  );
}
