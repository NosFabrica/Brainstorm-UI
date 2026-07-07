import { describe, it, expect } from "vitest";
import { formatDuration } from "./schedulingDurations";

describe("formatDuration", () => {
  it("formats a 7-day interval as '7d'", () => {
    expect(formatDuration(604800)).toBe("7d");
  });

  it("formats a 6-hour interval as '6h'", () => {
    expect(formatDuration(21600)).toBe("6h");
  });

  it("formats a compound sub-hour duration with two units", () => {
    expect(formatDuration(90)).toBe("1m 30s");
  });

  it("drops zero units and caps at the two largest non-zero units", () => {
    // 1d 0h 1m 1s -> keep the two largest present: 1d 1m
    expect(formatDuration(86461)).toBe("1d 1m");
  });

  it("formats zero as '0s'", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});
