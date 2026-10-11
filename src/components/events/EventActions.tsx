"use client";

import { BookingButton } from "@/components/bookings/BookingButton";
import type { LiveEvent } from "@/domain/types";
import { SaveEventButton } from "./SaveEventButton";

/** Card/detail actions inside the app: save, and record a booking (real events only). */
export function EventActions({ event }: { event: LiveEvent }) {
  return (
    <>
      <SaveEventButton event={event} />
      <BookingButton event={event} />
    </>
  );
}
