// @vitest-environment node
/**
 * The profile page's trust score per person is the viewer's score of them, in
 * the active Perspective: another Account or another Perspective must not see it.
 */
import { describe, expect, it } from "vitest";
import { accountChanged, perspectiveChanged } from "@/lib/accountScoped";
import { expandTrustCache } from "./profilePageCache";

describe("the profile page's trust cache", () => {
  it.each([
    ["the Active Account", accountChanged],
    ["the Perspective", perspectiveChanged],
  ])("is forgotten when %s changes", (_what, change) => {
    expandTrustCache.set("a".repeat(64), 0.5);
    change();
    expect(expandTrustCache.size).toBe(0);
  });
});
