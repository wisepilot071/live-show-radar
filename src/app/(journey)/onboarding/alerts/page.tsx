import { redirect } from "next/navigation";

/** Alert choices are no longer an onboarding step; they're edited in Settings. */
export default function AlertsPage() {
  redirect("/settings#alerts");
}
