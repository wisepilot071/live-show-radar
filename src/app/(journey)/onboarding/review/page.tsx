import { redirect } from "next/navigation";

/** The review step was removed: artist selection continues straight to the radar. */
export default function ReviewPage() {
  redirect("/onboarding/artists");
}
