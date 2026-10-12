/**
 * A place's ways out and its words: directions from its coordinates, the way
 * the device prefers (directionsUrl), its category as
 * words rather than an OpenStreetMap value, and its local wall clock
 * estimated from its longitude — 15° per hour, no daylight saving — for
 * saying whether it's open now (lib/openingHours).
 */
import { DAYS, type Day } from "@/lib/openingHours";

const coord = (v: string | null | undefined): number | null => {
  const n = Number((v ?? "").trim());
  return (v ?? "").trim() && Number.isFinite(n) ? n : null;
};

export type Platform = "ios" | "android" | "desktop";

/** The device, from its user agent: an iPhone or iPad, an Android, or anything else. */
export function platformOf(userAgent: string = typeof navigator !== "undefined" ? navigator.userAgent : ""): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

/**
 * Directions to the place, the way the device prefers: Apple Maps on an
 * iPhone or iPad (iOS hands the link to the Maps app), a `geo:` link on
 * Android (the system offers the maps apps installed — Google Maps, Waze,
 * whichever the reader uses), Google Maps in the browser on a desktop.
 */
export function directionsUrl(
  place: { lat: string | null; lon: string | null; name: string },
  platform: Platform = platformOf(),
): string | null {
  const lat = coord(place.lat);
  const lon = coord(place.lon);
  if (lat == null || lon == null) return null;
  const at = `${lat},${lon}`;
  const label = encodeURIComponent(place.name);
  if (platform === "ios") return `https://maps.apple.com/?daddr=${encodeURIComponent(at)}&q=${label}`;
  if (platform === "android") return `geo:${at}?q=${at}(${label})`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(at)}`;
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

/**
 * The address as a reader expects it — street, city, state and postcode —
 * from the list's parts. The list's one-line `address` often already ends
 * with the city and the postcode (OpenStreetMap's habit), so those are said
 * once: trailing words that repeat the locality or the postcode are taken
 * off the street before the parts are joined.
 */
export function addressLine(place: {
  address: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
}): string | null {
  const locality = place.locality?.trim() || null;
  const region = place.region?.trim() || null;
  const postal = place.postalCode?.trim() || null;
  let street = place.address?.trim() || null;
  let postalSeen: string | null = null;
  if (street) {
    const words = street.split(/\s+/);
    // Peel the postcode (or a longer form of it, 34231-5608) and the locality's words off the end.
    const peel = () => {
      const last = words[words.length - 1] ?? "";
      if (postal && (last === postal || last.startsWith(`${postal}-`))) {
        postalSeen = words.pop() ?? null;
        return true;
      }
      if (locality) {
        const lw = locality.split(/\s+/);
        const tail = words.slice(-lw.length).join(" ");
        if (words.length > lw.length && tail.toLowerCase() === locality.toLowerCase()) {
          words.splice(-lw.length, lw.length);
          return true;
        }
      }
      return false;
    };
    while (words.length > 1 && peel()) {
      /* until nothing more repeats */
    }
    street = words.join(" ").replace(/,\s*$/, "") || null;
  }
  const code = postalSeen ?? postal;
  const regionLine = [region, code].filter(Boolean).join(" ") || null;
  const parts = [street, locality, regionLine].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}
