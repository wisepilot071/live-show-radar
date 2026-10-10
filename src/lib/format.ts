import type { EventDateTime, IsoTimestamp } from "@/domain/types";

const IST = "Asia/Kolkata";

/** Formats an event date. Returns "Date not announced" when unknown — never guesses. */
export function formatEventDate(when: EventDateTime): string {
  if (when.startsAt) {
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: when.timeZone,
    }).format(new Date(when.startsAt));
  }
  if (when.date) {
    // Date-only: format at noon in the venue zone so the day cannot shift.
    return new Intl.DateTimeFormat("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: when.timeZone,
    }).format(new Date(`${when.date}T12:00:00Z`));
  }
  return "Date not announced";
}

export function formatTimestamp(ts: IsoTimestamp, timeZone: string = IST): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(ts));
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "district.in" from a URL, for honest link labels ("Ticket page on district.in"). */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "external site";
  }
}
