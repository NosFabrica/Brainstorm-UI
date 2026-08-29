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
  planPriceLabel,
  tierMeetsRequirement,
  nextScheduledLabel,
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
    const withPlanned = [...TIERS.priority.featureKeys, planned.key];
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

  // Admins retune prices in the Flash dashboard without a UI deploy — the
  // LIVE plan wins wherever one is loaded; the constant is only a fallback.
  it("prefers the live plan's price over the build-time constant", () => {
    expect(planPriceLabel({ amountMinor: 300, currency: "USD" }, PAID_TIER)).toBe("$3");
    expect(planPriceLabel({ amountMinor: 250, currency: "USD" }, PAID_TIER)).toBe("$2.50");
    expect(planPriceLabel({ amountMinor: 0, currency: "USD" }, "free")).toBe("Free");
    expect(planPriceLabel({ amountMinor: 200, currency: "EUR" }, PAID_TIER)).toBe("2 EUR");
  });

  it("falls back to the constant when no plan has loaded", () => {
    expect(planPriceLabel(undefined, PAID_TIER)).toBe("$2");
    expect(planPriceLabel(undefined, "free")).toBe("Free");
  });
});

describe("plans — ranking", () => {
  it("orders free below the paid tier", () => {
    expect(tierMeetsRequirement("priority", "free")).toBe(true);
    expect(tierMeetsRequirement("free", "priority")).toBe(false);
    expect(tierMeetsRequirement("free", "free")).toBe(true);
  });
});

describe("nextScheduledLabel", () => {
  const NOW = Date.UTC(2026, 7, 17);
  const daysAgo = (n: number) => NOW - n * 86_400_000;

  it("counts down from the plan's own interval", () => {
    // Free is 60 days: a run 47 days ago is due in 13.
    expect(nextScheduledLabel(daysAgo(47), "free", NOW)).toBe("in 13 days");
    // Priority is 7: a run 2 days ago is due in 5.
    expect(nextScheduledLabel(daysAgo(2), "priority", NOW)).toBe("in 5 days");
  });

  it("says due now once the interval has passed, and never goes negative", () => {
    // The worst failure here would be "in -4 days" on someone's account page.
    expect(nextScheduledLabel(daysAgo(64), "free", NOW)).toBe("due now");
    expect(nextScheduledLabel(daysAgo(60), "free", NOW)).toBe("due now");
  });

  it("singularises one day", () => {
    expect(nextScheduledLabel(daysAgo(59), "free", NOW)).toBe("in 1 day");
  });

  it("returns null with no last run — a guess with nothing behind it is fiction", () => {
    expect(nextScheduledLabel(null, "free", NOW)).toBeNull();
    expect(nextScheduledLabel(0, "priority", NOW)).toBeNull();
  });

  it("uses the interval the tier advertises, so label and arithmetic can't drift", () => {
    // Same elapsed time, different plan → different answer, both from
    // recalcIntervalDays rather than a hardcoded number in the component.
    expect(nextScheduledLabel(daysAgo(5), "free", NOW)).toBe("in 55 days");
    expect(nextScheduledLabel(daysAgo(5), "priority", NOW)).toBe("in 2 days");
  });
});
