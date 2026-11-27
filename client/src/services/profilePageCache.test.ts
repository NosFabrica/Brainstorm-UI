// @vitest-environment node
/**
 * The profile page's trust score per person is the viewer's score of them, in
 * the active Perspective: another Account or another Perspective must not see it.
 */
import { describe, expect, it } from "vitest";
import { accountChanged, perspectiveChanged } from "@/lib/accountScoped";
import { expandTrustCacheFor } from "./profilePageCache";

describe("the profile page's trust cache", () => {
  it.each([
    ["the Active Account", accountChanged],
    ["the Perspective", perspectiveChanged],
  ])("is forgotten when %s changes", (_what, change) => {
    expandTrustCacheFor("a".repeat(64), "default").set("c".repeat(64), 0.5);
    change();
    expect(expandTrustCacheFor("a".repeat(64), "default").size).toBe(0);
  });
});

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
