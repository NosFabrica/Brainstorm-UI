/**
 * How far one place is from another — the great-circle distance from their
 * coordinates — and how to say it: kilometres for most readers, miles where
 * miles are spoken (the US, the UK's roads aside, Liberia, Myanmar).
 */
export interface LatLon {
  lat: number;
  lon: number;
}

const EARTH_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(h));
}

const MILES = new Set(["US", "LR", "MM"]);

function usesMiles(locale: string): boolean {
  try {
    const region = new Intl.Locale(locale).maximize().region ?? "";
    return MILES.has(region);
  } catch {
    return false;
  }
}

export function distanceWords(
  km: number,
  locale: string = typeof navigator !== "undefined" ? navigator.language : "en",
): string {
  if (usesMiles(locale)) {
    const mi = km / 1.609344;
    return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
  }
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
