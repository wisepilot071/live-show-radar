/**
 * Converts a wall-clock date/time in an IANA zone to a UTC instant, with no
 * dependency. Uses Intl to find the zone's offset at that moment (handles
 * DST for zones that have it). Returns undefined for invalid input rather
 * than guessing.
 */
export function zonedToUtcIso(localDate: string, localTime: string, timeZone: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate) || !/^\d{2}:\d{2}$/.test(localTime)) return undefined;
  const asUtc = Date.parse(`${localDate}T${localTime}:00Z`);
  if (Number.isNaN(asUtc)) return undefined;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return undefined; // unknown zone
  }
  // Offset = (wall clock in zone at instant) − instant. Two passes settle DST edges.
  let guess = asUtc;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const wall = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    guess = asUtc - (wall - guess);
  }
  return new Date(guess).toISOString();
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
