import { describe, expect, it } from "vitest";
import { expandTrustCacheFor } from "./profilePageCache";

const ALICE = "a".repeat(64);
const BOB = "b".repeat(64);
const PEER = "c".repeat(64);

describe("expandTrustCacheFor", () => {
  it("keeps one viewer's scores from another's", () => {
    expandTrustCacheFor(ALICE, "default").set(PEER, 0.9);
    expect(expandTrustCacheFor(BOB, "default").has(PEER)).toBe(false);
    expect(expandTrustCacheFor(ALICE, "default").get(PEER)).toBe(0.9);
  });

  it("keeps one preset's scores from another's", () => {
    expandTrustCacheFor(ALICE, "default").set(PEER, 0.9);
    expect(expandTrustCacheFor(ALICE, "strict").has(PEER)).toBe(false);
  });

  it("hands back the same cache for the same scope", () => {
    expect(expandTrustCacheFor(ALICE, "default")).toBe(expandTrustCacheFor(ALICE, "default"));
  });
});
