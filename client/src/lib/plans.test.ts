import { describe, it, expect } from "vitest";
import {
  TIERS,
  TIER_ORDER,
  TIER_FEATURES,
  PAID_TIER,
  liveFeatures,
  plannedFeatures,
  plannedByTheme,
  formatPrice,
  tierMeetsRequirement,
} from "./plans";

/**
 * The guard that matters here is not arithmetic — it's the promise boundary.
 *
 * The three-tier version of this file listed nine paid features that did not
 * exist. `status: "planned"` plus `liveFeatures()` is the mechanism that stops
 * that recurring, so the test that earns its place is the one that fails if a
 * planned feature ever reaches a "what you get" list — including by someone
 * later adding a key to a tier without checking.
 */
describe("plans — the promise boundary", () => {
  it("never lets a planned feature into a tier's included list", () => {
    for (const id of TIER_ORDER) {
      for (const f of liveFeatures(id)) {
        expect(f.status).toBe("live");
      }
    }
  });

  it("drops a planned key silently instead of rendering it as included", () => {
    // Simulates the mistake this design exists to absorb: someone drops a
    // roadmap key into a tier. It must vanish from the included list, not
    // appear as a tick.
    const planned = plannedFeatures()[0];
    expect(planned).toBeDefined();
    const withPlanned = [...TIERS.supporter.featureKeys, planned.key];
    const rendered = withPlanned
      .map((k) => TIER_FEATURES[k])
      .filter((f) => f && f.status === "live");
    expect(rendered.map((f) => f.key)).not.toContain(planned.key);
  });

  it("gives every planned item a theme, so none vanishes from the roadmap", () => {
    // plannedByTheme() filters by theme; an item without one renders nowhere,
    // which is a silent disappearance rather than a visible mistake.
    const themed = plannedByTheme().flatMap((g) => g.items.map((f) => f.key));
    for (const f of plannedFeatures()) {
      expect(themed, `${f.key} has no theme`).toContain(f.key);
    }
  });

  it("every tier lists at least one real thing", () => {
    // A tier with nothing live is a tier we cannot honestly sell.
    for (const id of TIER_ORDER) {
      expect(liveFeatures(id).length).toBeGreaterThan(0);
    }
  });

  it("has no key in a tier that is missing from TIER_FEATURES", () => {
    // A typo'd key would otherwise disappear quietly — the filter that protects
    // us from planned features would also swallow a genuine feature.
    for (const id of TIER_ORDER) {
      for (const key of TIERS[id].featureKeys) {
        expect(TIER_FEATURES[key], `unknown feature key: ${key}`).toBeDefined();
      }
    }
  });
});

describe("plans — price", () => {
  it("formats from minor units so it cannot drift from what Flash charges", () => {
    // Flash's page carries data-amount="200" data-currency="USD".
    expect(TIERS[PAID_TIER].usdMinorPerMonth).toBe(200);
    expect(formatPrice(PAID_TIER)).toBe("$2");
    expect(formatPrice("free")).toBe("Free");
  });
});

describe("plans — ranking", () => {
  it("orders free below the paid tier", () => {
    expect(tierMeetsRequirement("supporter", "free")).toBe(true);
    expect(tierMeetsRequirement("free", "supporter")).toBe(false);
    expect(tierMeetsRequirement("free", "free")).toBe(true);
  });
});
