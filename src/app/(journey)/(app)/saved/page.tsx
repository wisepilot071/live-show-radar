import type { Metadata } from "next";
import { SavedShows } from "@/components/saved/SavedShows";

export const metadata: Metadata = { title: "Saved shows" };

export default function SavedPage() {
  return <SavedShows />;
}
