import { redirect } from "next/navigation";

/** Onboarding starts at artist selection (Spotify is a "coming soon" card there). */
export default function OnboardingStartPage() {
  redirect("/onboarding/artists");
}
