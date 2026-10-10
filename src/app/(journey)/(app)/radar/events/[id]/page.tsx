import type { Metadata } from "next";
import { EventDetail } from "@/components/events/EventDetail";

export const metadata: Metadata = { title: "Show details" };

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EventDetail id={decodeURIComponent(id)} />;
}
