import { describe, expect, it } from "vitest";
import { formatEventTime } from "./calendarEvent";

describe("formatEventTime", () => {
  it("says the clock time, or All day for a date-only event", () => {
    const at = Math.floor(new Date(2026, 8, 4, 19, 0).getTime() / 1000);
    expect(formatEventTime(at, false)).toMatch(/7:00\s?PM|19:00/);
    expect(formatEventTime(at, true)).toBe("All day");
    expect(formatEventTime(0, false)).toBe("");
  });
});
