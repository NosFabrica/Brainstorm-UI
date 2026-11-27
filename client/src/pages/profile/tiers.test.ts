import { describe, expect, it } from "vitest";
import { TIER_LABELS } from "@/services/trustThreshold";
import { confidenceGuidanceFor, grTierCountsToUI, tierBreakdownRows } from "./tiers";

describe("grTierCountsToUI", () => {
  it("folds the backend buckets onto the five display slices, flagged into unverified", () => {
    expect(
      grTierCountsToUI({
        high: 3,
        medium_high: 2,
        medium: 4,
        medium_low: 1,
        low: 5,
        low_and_reported_by_2_or_more_trusted_pubkeys: 2,
      }),
    ).toEqual({ high: 3, trusted: 2, neutral: 4, low: 1, unverified: 7 });
  });

  it("is all zeros without counts", () => {
    expect(grTierCountsToUI(null)).toEqual({ high: 0, trusted: 0, neutral: 0, low: 0, unverified: 0 });
  });
});

describe("tierBreakdownRows", () => {
  const counts = { high: 3, trusted: 0, neutral: 4, low: 1, unverified: 7 };

  it("lists the non-empty slices under Detailed", () => {
    expect(tierBreakdownRows(counts, "detailed").map((r) => [r.tier, r.count])).toEqual([
      [TIER_LABELS.high, 3],
      ["Neutral", 4],
      ["Low", 1],
      ["Unverified", 7],
    ]);
  });

  it("is Verified / Unknown under Simple, leaving out an empty one", () => {
    expect(tierBreakdownRows(counts, "simple").map((r) => [r.tier, r.count])).toEqual([
      ["Verified", 8],
      ["Unknown", 7],
    ]);
    expect(tierBreakdownRows({ ...counts, unverified: 0 }, "simple").map((r) => r.tier)).toEqual(["Verified"]);
  });
});

describe("confidenceGuidanceFor", () => {
  it("steps at 50, 20 and 7 percent and names the person", () => {
    expect(confidenceGuidanceFor(0.5, "Ann")).toMatchObject({ label: "High confidence", pct: 50, icon: "check" });
    expect(confidenceGuidanceFor(0.2, "Ann")).toMatchObject({ label: "Moderate confidence", icon: "shield" });
    expect(confidenceGuidanceFor(0.07, "Ann")).toMatchObject({ label: "Low confidence", icon: "alert" });
    expect(confidenceGuidanceFor(0.064, "Ann")).toMatchObject({ label: "Very low confidence", pct: 6, icon: "x" });
    // The steps are on the rounded percent.
    expect(confidenceGuidanceFor(0.069, "Ann")).toMatchObject({ label: "Low confidence", pct: 7 });
    expect(confidenceGuidanceFor(0.9, "Ann").message).toContain("Ann");
  });
});
