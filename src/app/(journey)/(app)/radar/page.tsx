import type { Metadata } from "next";
import { RadarDashboard } from "@/components/radar/RadarDashboard";

export const metadata: Metadata = { title: "Your radar" };

export default function RadarPage() {
  return <RadarDashboard />;
}
