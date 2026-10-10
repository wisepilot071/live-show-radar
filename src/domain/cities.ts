import type { City } from "./types";

/**
 * Initial city list (bundled, not from a city catalogue service).
 * Covers India's major live-music markets; the selector also accepts any city
 * a future catalogue provides because it only depends on the `City` type.
 */
export const INITIAL_CITIES: readonly City[] = [
  { id: "bengaluru", name: "Bengaluru", region: "Karnataka", countryCode: "IN" },
  { id: "mumbai", name: "Mumbai", region: "Maharashtra", countryCode: "IN" },
  { id: "delhi", name: "New Delhi", region: "Delhi", countryCode: "IN" },
  { id: "gurugram", name: "Gurugram", region: "Haryana", countryCode: "IN" },
  { id: "pune", name: "Pune", region: "Maharashtra", countryCode: "IN" },
  { id: "hyderabad", name: "Hyderabad", region: "Telangana", countryCode: "IN" },
  { id: "chennai", name: "Chennai", region: "Tamil Nadu", countryCode: "IN" },
  { id: "kolkata", name: "Kolkata", region: "West Bengal", countryCode: "IN" },
  { id: "goa", name: "Goa", region: "Goa", countryCode: "IN" },
  { id: "shillong", name: "Shillong", region: "Meghalaya", countryCode: "IN" },
  { id: "kochi", name: "Kochi", region: "Kerala", countryCode: "IN" },
  { id: "ahmedabad", name: "Ahmedabad", region: "Gujarat", countryCode: "IN" },
  { id: "jaipur", name: "Jaipur", region: "Rajasthan", countryCode: "IN" },
  { id: "chandigarh", name: "Chandigarh", region: "Chandigarh", countryCode: "IN" },
];

export const DEFAULT_PRIMARY_CITY_ID = "bengaluru";

export function findCity(id: string): City | undefined {
  return INITIAL_CITIES.find((c) => c.id === id);
}

export function cityLabel(id: string): string {
  const c = findCity(id);
  return c ? `${c.name}, ${c.region}` : "Unknown city";
}

/** Alternate spellings and districts sources use for the same city. */
const CITY_ALIASES: Record<string, string[]> = {
  bengaluru: ["bangalore", "bengaluru urban", "bangalore urban"],
  mumbai: ["bombay", "navi mumbai", "mumbai suburban", "thane"],
  delhi: ["delhi", "new delhi", "nct of delhi", "national capital territory of delhi", "noida"],
  gurugram: ["gurgaon"],
  pune: ["poona"],
  hyderabad: ["secunderabad"],
  chennai: ["madras"],
  kolkata: ["calcutta"],
  goa: ["panaji", "panjim", "vagator", "anjuna", "north goa", "south goa", "mapusa"],
  kochi: ["cochin", "ernakulam"],
};

function norm(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/s+/g, " ").trim();
}

/**
 * Deterministic city match against the bundled list (+ aliases).
 * Returns undefined rather than guessing when nothing matches exactly.
 */
export function matchIndianCity(name: string | undefined | null): City | undefined {
  if (!name) return undefined;
  const n = norm(name);
  if (!n) return undefined;
  return INITIAL_CITIES.find((c) => norm(c.name) === n || c.id === n || (CITY_ALIASES[c.id] ?? []).includes(n));
}

/**
 * Coarse India bounding test for venues whose area isn't a known city.
 * It also covers parts of neighbouring countries, so a hit only yields
 * location_confidence "coordinates" (shown as needing verification).
 */
export function withinIndiaBounds(lat: number, lon: number): boolean {
  return lat >= 6.5 && lat <= 35.7 && lon >= 68.1 && lon <= 97.4;
}
