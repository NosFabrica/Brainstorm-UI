/**
 * "Near me": the one time the app asks where a person is — on their tap,
 * never on load — and the box around that position the Places page then
 * searches (`?area=`, the same filter "Search this area" writes). The
 * position is used for that search and kept nowhere.
 */
export type Position = { lat: number; lon: number };
export type Area = { south: number; west: number; north: number; east: number };

export type LocateReason = "declined" | "unavailable" | "unsupported";
export class LocateError extends Error {
  constructor(public readonly reason: LocateReason) {
    super(reason);
  }
}

const KM_PER_DEGREE = 111.32;

/** A box `km` in every direction from a position — a walk or a short drive. */
export function areaAround({ lat, lon }: Position, km: number): Area {
  const dLat = km / KM_PER_DEGREE;
  const dLon = km / (KM_PER_DEGREE * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { south: lat - dLat, west: lon - dLon, north: lat + dLat, east: lon + dLon };
}

/**
 * Ask the browser for the position, once. Rejects with the reason — declined
 * (the person said no), unavailable (no fix), unsupported (no such thing here).
 */
export function locate(geo: Geolocation | undefined = globalThis.navigator?.geolocation): Promise<Position> {
  if (!geo) return Promise.reject(new LocateError("unsupported"));
  return new Promise((resolve, reject) => {
    geo.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      (e) => reject(new LocateError(e.code === 1 ? "declined" : "unavailable")),
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}
