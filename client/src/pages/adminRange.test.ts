import { describe, expect, it } from "vitest";
import { parseAdminRange, rangeQuery, withinRange } from "./adminRange";

const NOW = Date.UTC(2026, 9, 22, 12, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// One range for the whole dashboard, carried in `?range=`; what each value
// asks the backend for (`days`, 1–365) and where the client cuts within it.
describe("parseAdminRange", () => {
  it("opens the range the URL names", () => {
    for (const r of ["1h", "24h", "7d", "30d", "all"] as const) expect(parseAdminRange(r)).toBe(r);
  });

  it("falls back to the last 24 hours for anything else", () => {
    expect(parseAdminRange(null)).toBe("24h");
    expect(parseAdminRange("90")).toBe("24h");
  });
});

describe("rangeQuery", () => {
  it("asks the backend for whole days and cuts the hour client-side", () => {
    expect(rangeQuery("1h", NOW)).toEqual({ days: 1, sinceMs: NOW - HOUR });
    expect(rangeQuery("24h", NOW)).toEqual({ days: 1, sinceMs: NOW - DAY });
    expect(rangeQuery("7d", NOW)).toEqual({ days: 7, sinceMs: NOW - 7 * DAY });
    expect(rangeQuery("30d", NOW)).toEqual({ days: 30, sinceMs: NOW - 30 * DAY });
  });

  it("asks for the backend's full year for All, with no client cut", () => {
    expect(rangeQuery("all", NOW)).toEqual({ days: 365, sinceMs: 0 });
  });
});

describe("withinRange", () => {
  it("keeps records inside the range and drops the ones before it", () => {
    expect(withinRange(NOW - 59 * 60_000, "1h", NOW)).toBe(true);
    expect(withinRange(NOW - 61 * 60_000, "1h", NOW)).toBe(false);
    expect(withinRange(NOW - 6 * DAY, "7d", NOW)).toBe(true);
    expect(withinRange(NOW - 8 * DAY, "7d", NOW)).toBe(false);
    expect(withinRange(NOW - 400 * DAY, "all", NOW)).toBe(true);
  });
});
