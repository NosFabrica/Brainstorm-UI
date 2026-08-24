import { describe, expect, it } from "vitest";
import { resolveHopsOrigin } from "./useHopsOrigin";

const HOUSE = "h".repeat(64);
const ME = "a".repeat(64);

describe("resolveHopsOrigin", () => {
  it("uses the viewer when personalized is usable", () => {
    expect(resolveHopsOrigin({ pov: "personalized", viewerPubkey: ME, calcDone: true, housePubkey: HOUSE }))
      .toEqual({ origin: ME, originPov: "personalized", isFallback: false });
  });

  it("falls back to House — and says so — when personalized has no completed calculation", () => {
    expect(resolveHopsOrigin({ pov: "personalized", viewerPubkey: ME, calcDone: false, housePubkey: HOUSE }))
      .toEqual({ origin: HOUSE, originPov: "global", isFallback: true });
  });

  it("falls back to House when personalized has no viewer at all", () => {
    expect(resolveHopsOrigin({ pov: "personalized", viewerPubkey: null, calcDone: true, housePubkey: HOUSE }))
      .toEqual({ origin: HOUSE, originPov: "global", isFallback: true });
  });

  it("is plainly House under the global toggle — no fallback flag", () => {
    expect(resolveHopsOrigin({ pov: "global", viewerPubkey: ME, calcDone: true, housePubkey: HOUSE }))
      .toEqual({ origin: HOUSE, originPov: "global", isFallback: false });
  });

  it("has no origin until the house pubkey resolves", () => {
    expect(resolveHopsOrigin({ pov: "global", viewerPubkey: null, calcDone: false, housePubkey: null }).origin).toBeNull();
  });
});
