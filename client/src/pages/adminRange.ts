/**
 * The admin dashboard's one time range, as `?range=` names it. Every tab's
 * figures, charts and lists read the same range, so a pick in the header
 * changes the whole dashboard, never one card.
 *
 * A preset, or "last N days" as `14d` — whatever the backend's `days`
 * (1–365, whole days) can serve; nothing the data can't back.
 */
export type AdminPreset = "1h" | "24h" | "72h" | "7d" | "30d" | "all";
export type AdminRange = AdminPreset | `${number}d`;

export const ADMIN_RANGES: readonly AdminPreset[] = ["1h", "24h", "72h", "7d", "30d", "all"];

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** The backend's `days` ceiling (`Query(30, ge=1, le=365)`). */
export const BACKEND_MAX_DAYS = 365;

/** The day count of a custom "last N days" range; null for a preset. */
export function customDays(range: AdminRange): number | null {
  if ((ADMIN_RANGES as readonly string[]).includes(range)) return null;
  return Number(range.slice(0, -1));
}

/** The range a `?range=` value opens; anything unknown is the last 24 hours. */
export function parseAdminRange(value: string | null): AdminRange {
  if (!value) return "24h";
  if ((ADMIN_RANGES as readonly string[]).includes(value)) return value as AdminPreset;
  const custom = /^([1-9]\d{0,2})d$/.exec(value);
  if (custom && Number(custom[1]) <= BACKEND_MAX_DAYS) return `${Number(custom[1])}d`;
  return "24h";
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
    case "72h":
      return { days: 3, sinceMs: now - 3 * DAY_MS };
    case "7d":
      return { days: 7, sinceMs: now - 7 * DAY_MS };
    case "30d":
      return { days: 30, sinceMs: now - 30 * DAY_MS };
    case "all":
      return { days: BACKEND_MAX_DAYS, sinceMs: 0 };
    default: {
      const days = customDays(range) ?? 1;
      return { days, sinceMs: now - days * DAY_MS };
    }
  }
}

/** Whether a record stamped `ts` (ms) falls inside the range. */
export function withinRange(ts: number, range: AdminRange, now: number): boolean {
  return ts >= rangeQuery(range, now).sinceMs && ts <= now;
}
