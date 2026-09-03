import { describe, expect, it } from "vitest";
import { bucketFor, ladderFor, rungFor, rungFraction } from "./trustLadder";
import { DEFAULT_VERIFIED_LINE } from "@/services/trustThreshold";

describe("the three-bucket ladder", () => {
  it("puts the verified line, and only the verified line, between Verified and Unknown", () => {
    expect(bucketFor(DEFAULT_VERIFIED_LINE, false)).toBe("verified");
    expect(bucketFor(DEFAULT_VERIFIED_LINE - 0.0001, false)).toBe("unknown");
    expect(bucketFor(0.95, false)).toBe("verified");
  });

  it("treats no score as Unknown, not as a verdict", () => {
    expect(bucketFor(null, false)).toBe("unknown");
    expect(bucketFor(undefined, false)).toBe("unknown");
    expect(bucketFor(NaN, false)).toBe("unknown");
  });

  it("lets Flagged win over any score", () => {
    expect(bucketFor(0.99, true)).toBe("flagged");
    expect(bucketFor(null, true)).toBe("flagged");
  });

  it("orders the ladder bad → unknown → good, so pips read as a ladder", () => {
    expect(ladderFor("simple").map((r) => r.key)).toEqual(["flagged", "unknown", "verified"]);
    expect(rungFor(0.9, false, "simple").rung).toBe(3);
    expect(rungFor(0.0, false, "simple").rung).toBe(2);
    expect(rungFor(0.9, true, "simple").rung).toBe(1);
    expect(rungFraction(0.9, false, "simple")).toBe(1);
  });

  it("keeps every rung legible without color — a glyph each under Simple", () => {
    for (const r of ladderFor("simple")) expect(r.glyph).not.toBe("none");
  });

  it("never invents a hue: simple colors are three of the existing tier constants", () => {
    const detailed = new Set(ladderFor("detailed").map((r) => r.color));
    for (const r of ladderFor("simple")) expect(detailed.has(r.color)).toBe(true);
  });

  it("keeps the detailed ladder as today's five tiers plus Flagged at the bottom", () => {
    expect(ladderFor("detailed").map((r) => r.key)).toEqual(["flagged", "unverified", "low", "neutral", "trusted", "high"]);
    expect(rungFor(0.9, false, "detailed").key).toBe("high");
    expect(rungFor(0.9, true, "detailed").key).toBe("flagged");
  });
});
