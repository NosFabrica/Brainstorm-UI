import { describe, expect, it } from "vitest";
import { reporterBreakdown, breakdownLine } from "@/lib/reporterBreakdown";

const pk = (c: string) => c.repeat(64);
const r = (c: string, influence: number | null) => ({ pubkey: pk(c), influence });

describe("reporterBreakdown — who reported an account, as the reader would weigh them", () => {
  const reporters = [r("a", 0.01), r("b", 0.9), r("c", 0.3), r("d", 0.019), r("e", null), r("f", 0.6), r("g", 0.02)];
  const follows = new Set([pk("a"), pk("f")]);
  const groups = reporterBreakdown(reporters, { follows, verifiedLine: 0.02 });

  it("puts people the reader follows first, whatever their score", () => {
    expect(groups.youFollow.map((x) => x.pubkey)).toEqual([pk("f"), pk("a")]);
  });

  it("splits everyone else at the verified line, best first", () => {
    expect(groups.verified.map((x) => x.pubkey)).toEqual([pk("b"), pk("c"), pk("g")]);
    expect(groups.unverified.map((x) => x.pubkey)).toEqual([pk("d"), pk("e")]);
  });

  it("reads as one line, leaving out empty groups", () => {
    expect(breakdownLine(groups)).toBe("2 people you follow · 3 verified · 2 unverified");
    expect(breakdownLine(reporterBreakdown([r("b", 0.9)], { follows: new Set(), verifiedLine: 0.02 }))).toBe(
      "1 verified",
    );
    expect(breakdownLine(reporterBreakdown([r("a", 0.5)], { follows: new Set([pk("a")]), verifiedLine: 0.02 }))).toBe(
      "1 person you follow",
    );
  });
});
