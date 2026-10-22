/**
 * The admin dashboard's one time range, as `?range=` names it. Every tab's
 * figures, charts and lists read the same range, so a pick in the header
 * changes the whole dashboard, never one card.
 */
export type AdminRange = "1h" | "24h" | "7d" | "30d" | "all";

export const ADMIN_RANGES: readonly AdminRange[] = ["1h", "24h", "7d", "30d", "all"];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** The backend's `days` ceiling (`Query(30, ge=1, le=365)`). */
const BACKEND_MAX_DAYS = 365;

/** The range a `?range=` value opens; anything unknown is the last 24 hours. */
export function parseAdminRange(value: string | null): AdminRange {
  return value && (ADMIN_RANGES as readonly string[]).includes(value) ? (value as AdminRange) : "24h";
}

/**
 * What a range asks of the backend (`days`, whole days only) and where the
 * client cuts within what comes back (`sinceMs`; 0 keeps everything).
 */
export function rangeQuery(range: AdminRange, now: number): { days: number; sinceMs: number } {
  switch (range) {
    case "1h":
      return { days: 1, sinceMs: now - HOUR_MS };
    case "24h":
      return { days: 1, sinceMs: now - DAY_MS };
    case "7d":
      return { days: 7, sinceMs: now - 7 * DAY_MS };
    case "30d":
      return { days: 30, sinceMs: now - 30 * DAY_MS };
    case "all":
      return { days: BACKEND_MAX_DAYS, sinceMs: 0 };
  }
}

/** Whether a record stamped `ts` (ms) falls inside the range. */
export function withinRange(ts: number, range: AdminRange, now: number): boolean {
  return ts >= rangeQuery(range, now).sinceMs && ts <= now;
}
