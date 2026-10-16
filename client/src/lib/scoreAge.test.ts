import { describe, expect, it } from "vitest";
import { scoreAge } from "./scoreAge";

const NOW = Date.UTC(2026, 9, 12, 12, 0, 0); // 2026-10-12 noon
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000);

describe("scoreAge", () => {
  it("says how old the scores are in words a reader does not have to compute", () => {
    expect(scoreAge(daysAgo(0), NOW).label).toBe("today");
    expect(scoreAge(daysAgo(1), NOW).label).toBe("yesterday");
    expect(scoreAge(daysAgo(3), NOW).label).toBe("3 days ago");
    expect(scoreAge(daysAgo(11), NOW).label).toBe("1 week ago");
    expect(scoreAge(daysAgo(49), NOW).label).toBe("7 weeks ago");
    expect(scoreAge(daysAgo(70), NOW).label).toBe("2 months ago");
    expect(scoreAge(daysAgo(400), NOW).label).toBe("1 year ago");
  });

  it("calls scores stale past two weeks, and says so in weeks", () => {
    expect(scoreAge(daysAgo(13), NOW).stale).toBe(false);
    expect(scoreAge(daysAgo(14), NOW).stale).toBe(true);
    expect(scoreAge(daysAgo(49), NOW)).toEqual({ label: "7 weeks ago", stale: true, old: "7 weeks old" });
  });

  it("is null with no run date", () => {
    expect(scoreAge(null, NOW)).toBeNull();
  });
});
