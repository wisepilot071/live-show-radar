import { matchIndianCity } from "@/domain/cities";
import type { LiveEvent } from "@/domain/types";

/** How far ahead other-city shows are shown when an artist has none in your city or Bengaluru. */
export const OTHER_CITY_WINDOW_DAYS = 60;
export const FALLBACK_CITY_ID = "bengaluru";

function cityIdOf(e: LiveEvent): string | undefined {
  return e.cityId ?? matchIndianCity(e.cityName)?.id;
}

function startMs(e: LiveEvent): number | null {
  if (e.when.startsAt) return Date.parse(e.when.startsAt);
  if (e.when.date) return Date.parse(`${e.when.date}T12:00:00Z`);
  return null;
}

/**
 * One city per artist, in this order:
 *  1. the person's home city (chosen in onboarding/settings), any upcoming date;
 *  2. otherwise Bengaluru;
 *  3. otherwise other cities, but only shows in the next OTHER_CITY_WINDOW_DAYS days.
 * A show billed with several artists is kept if it is the chosen show for ANY of them.
 * Returns the kept events and how many were hidden (so the UI can offer "show every city").
 */
export function focusByCity(events: LiveEvent[], homeCityId: string, now: Date): { events: LiveEvent[]; hidden: number } {
  const horizon = now.getTime() + OTHER_CITY_WINDOW_DAYS * 86_400_000;
  const byArtist = new Map<string, LiveEvent[]>();
  for (const e of events) for (const a of e.artistIds.length ? e.artistIds : [e.id]) byArtist.set(a, [...(byArtist.get(a) ?? []), e]);

  const keep = new Set<string>();
  for (const list of byArtist.values()) {
    const home = list.filter((e) => cityIdOf(e) === homeCityId);
    const fallback = homeCityId === FALLBACK_CITY_ID ? [] : list.filter((e) => cityIdOf(e) === FALLBACK_CITY_ID);
    const chosen =
      home.length > 0
        ? home
        : fallback.length > 0
          ? fallback
          : list.filter((e) => {
              const t = startMs(e);
              return t !== null && t <= horizon;
            });
    for (const e of chosen) keep.add(e.id);
  }
  const kept = events.filter((e) => keep.has(e.id));
  return { events: kept, hidden: events.length - kept.length };
}
