import { redirect } from "next/navigation";

/** Spotify import isn't built yet; its "coming soon" card lives on the artists step. */
export default function SpotifyPage() {
  redirect("/onboarding/artists");
}
