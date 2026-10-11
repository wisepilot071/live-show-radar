import { redirect } from "next/navigation";

/** Setup status now lives on the radar itself (its status panel). */
export default function StatusPage() {
  redirect("/radar");
}
