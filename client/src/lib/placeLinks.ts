/**
 * A place's ways out and its words: directions from its coordinates (the
 * maps app a phone has, through Google's universal link), its category as
 * words rather than an OpenStreetMap value, and its local wall clock
 * estimated from its longitude — 15° per hour, no daylight saving — for
 * saying whether it's open now (lib/openingHours).
 */
import { DAYS, type Day } from "@/lib/openingHours";

const coord = (v: string | null | undefined): number | null => {
  const n = Number((v ?? "").trim());
  return (v ?? "").trim() && Number.isFinite(n) ? n : null;
};

export function directionsUrl(place: { lat: string | null; lon: string | null }): string | null {
  const lat = coord(place.lat);
  const lon = coord(place.lon);
  if (lat == null || lon == null) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lon}`)}`;
}

/** "fast_food" → "Fast food". */
export function categoryWords(value: string | null | undefined): string | null {
  const s = (value ?? "").trim().replace(/_/g, " ");
  return s ? s[0].toUpperCase() + s.slice(1) : null;
}

/**
 * The place's local day and minutes since midnight at `at`, estimated from
 * its longitude. Right everywhere but for an hour where daylight saving is
 * in force.
 */
export function placeLocalMinutes(lon: number, at: Date): { day: Day; minutes: number } {
  const offsetMinutes = Math.round(lon / 15) * 60;
  const local = new Date(at.getTime() + offsetMinutes * 60_000);
  // getUTCDay: 0 = Sunday; DAYS starts at Monday.
  const day = DAYS[(local.getUTCDay() + 6) % 7];
  return { day, minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}
