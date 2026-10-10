import type { Metadata } from "next";
import { Suspense } from "react";
import { ArtistsManager } from "@/components/artists/ArtistsManager";
import { LoadingIndicator } from "@/components/ui/LoadingIndicator";

export const metadata: Metadata = { title: "Artists" };

export default function ArtistsPage() {
  // useSearchParams (?focus=) needs a Suspense boundary.
  return (
    <Suspense fallback={<LoadingIndicator label="Loading your artists…" className="p-8" />}>
      <ArtistsManager />
    </Suspense>
  );
}
