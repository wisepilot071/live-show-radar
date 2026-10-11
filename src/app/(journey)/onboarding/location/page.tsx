import { redirect } from "next/navigation";

/** Cities are no longer an onboarding step; they're edited in Settings. */
export default function LocationPage() {
  redirect("/settings#location");
}
