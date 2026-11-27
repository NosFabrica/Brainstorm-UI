// @vitest-environment node
import { describe, expect, it } from "vitest";
import { articleWindows } from "./useNetworkArticles";

describe("the network articles' fetch windows", () => {
  // They are in the ask key: a remount a minute later must make the same ask, not a new one.
  it("are the same for every mount within the hour", () => {
    const start = Date.UTC(2026, 10, 25, 14, 0, 5);
    expect(articleWindows(start + 59 * 60_000)).toEqual(articleWindows(start));
    expect(articleWindows(start + 60 * 60_000).freshSince).toBeGreaterThan(articleWindows(start).freshSince);
  });

  it("reach back 90 days fresh and 180 wider", () => {
    const { freshSince, widerSince } = articleWindows(Date.UTC(2026, 10, 25));
    const now = Date.UTC(2026, 10, 25) / 1000;
    expect(now - freshSince).toBe(90 * 86_400);
    expect(now - widerSince).toBe(180 * 86_400);
  });
});
