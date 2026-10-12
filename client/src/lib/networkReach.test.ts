import { describe, expect, it } from "vitest";
import { countValuesOf, healthByHops, maxHopOf, reachByHops } from "./networkReach";

// The server's shape: tier → hops → count. Above the run's verified line are
// high, medium_high, medium and medium_low; at or below it, low; flagged is
// its own tier. Hop 999 is the server's "unreached" bucket.
const counts = {
  high: { "1": 40, "2": 10 },
  medium_high: { "2": 100 },
  medium: { "2": 300, "3": 50 },
  medium_low: { "2": 800 },
  low: { "2": 900, "3": 84, "4": 6 },
  low_and_reported_by_2_or_more_trusted_pubkeys: { "2": 3, "999": 12 },
};

describe("countValuesOf", () => {
  it("reads the run's count_values whether the server sent an object or a JSON string", () => {
    expect(countValuesOf(counts)).toEqual(counts);
    expect(countValuesOf(JSON.stringify(counts))).toEqual(counts);
  });

  it("is null when there is no run, no field, or a shape that is not tier → hops", () => {
    expect(countValuesOf(undefined)).toBeNull();
    expect(countValuesOf(null)).toBeNull();
    expect(countValuesOf("")).toBeNull();
    expect(countValuesOf("not json")).toBeNull();
    expect(countValuesOf(42)).toBeNull();
  });
});

describe("maxHopOf", () => {
  it("is the furthest hop the run reached, ignoring the unreached bucket", () => {
    expect(maxHopOf(counts)).toBe(4);
  });

  it("is 1 for a run that only reached direct follows, and for an empty run", () => {
    expect(maxHopOf({ high: { "1": 3 } })).toBe(1);
    expect(maxHopOf({})).toBe(1);
  });
});

describe("reachByHops", () => {
  it("counts everyone the run reached within the hop range, every tier", () => {
    expect(reachByHops(counts, 1, 1)).toBe(40);
    expect(reachByHops(counts, 1, 3)).toBe(40 + 10 + 100 + 300 + 50 + 800 + 900 + 84 + 3);
    expect(reachByHops(counts, 4, 4)).toBe(6);
  });
});

describe("healthByHops", () => {
  it("folds the tiers into verified, unknown and flagged for the hop range", () => {
    expect(healthByHops(counts, 1, 3)).toEqual({ verified: 1300, unknown: 984, flagged: 3 });
  });

  it("is all zeros when the range reaches nobody", () => {
    expect(healthByHops(counts, 7, 9)).toEqual({ verified: 0, unknown: 0, flagged: 0 });
  });
});
