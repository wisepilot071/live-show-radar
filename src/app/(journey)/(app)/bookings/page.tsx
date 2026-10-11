import type { Metadata } from "next";
import { MyBookings } from "@/components/bookings/MyBookings";

export const metadata: Metadata = { title: "My bookings" };

export default function BookingsPage() {
  return <MyBookings />;
}
