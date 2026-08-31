import { describe, it, expect } from "vitest";
import {
  TIER_FEATURES,
  PRODUCT_CLAIM_KEYS,
  cadenceDays,
  plannedFeatures,
  plannedByTheme,
  productClaims,
  formatAmount,
  formatBillingPeriod,
  nextScheduledLabel,
  SUBSCRIPTION_STATUS_LABEL,
} from "./plans";

/**
 * The guard that matters here is not arithmetic — it's the promise boundary.
 *
 * The three-tier version of this file listed nine paid features that did not
 * exist. `status: "planned"` plus accessors that filter on it is the mechanism
 * that stops that recurring, so the test that earns its place is the one that
 * fails if a planned feature ever reaches a "what you get" list.
 */
describe("plans — the promise boundary", () => {
  it("never lets a planned feature into what the product claims", () => {
    for (const f of productClaims()) {
      expect(f.status).toBe("live");
    }
  });

  it("drops a planned key silently instead of rendering it as included", () => {
    // Simulates the mistake this design exists to absorb: someone drops a
    // roadmap key into a claim list. It must vanish, not appear as a tick.
    const planned = plannedFeatures()[0];
    expect(planned).toBeDefined();
    const rendered = [...PRODUCT_CLAIM_KEYS, planned.key]
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

  it("has no claim key missing from TIER_FEATURES", () => {
    // A typo'd key would otherwise disappear quietly — the filter that protects
    // us from planned features would also swallow a genuine one.
    for (const key of PRODUCT_CLAIM_KEYS) {
      expect(TIER_FEATURES[key], `unknown feature key: ${key}`).toBeDefined();
    }
  });
});

describe("plans — what Brainstorm does", () => {
  // These four moved off the free tier card onto a static section, because
  // none of them is tier copy. The promise boundary has to follow them there.
  it("only ever lists things that exist", () => {
    const claims = productClaims();
    expect(claims.length).toBeGreaterThan(0);
    for (const f of claims) expect(f.status).toBe("live");
  });
});

describe("plans — the billing period, formatted not matched", () => {
  it("renders a unit it has never seen rather than dropping the plan", () => {
    // The whole reason the wire carries a unit and a count instead of a
    // "monthly" | "yearly" string: an unknown value must still render.
    expect(formatBillingPeriod("fortnight", 1)).toBe("per fortnight");
    expect(formatBillingPeriod("blargh", 3)).toBe("every 3 blarghs");
  });

  it("counts, so the $0.10/day plan and a 2-weekly one both read right", () => {
    expect(formatBillingPeriod("day", 1)).toBe("per day");
    expect(formatBillingPeriod("week", 2)).toBe("every 2 weeks");
    expect(formatBillingPeriod("year", 1)).toBe("per year");
  });

  it("reserves one-time for Flash's coming one-off type", () => {
    expect(formatBillingPeriod("once", null)).toBe("one-time");
  });

  it("returns null with no period, so the row renders with a price alone", () => {
    expect(formatBillingPeriod(null, null)).toBeNull();
    expect(formatBillingPeriod("", 1)).toBeNull();
  });

  it("treats a missing or nonsense count as one", () => {
    expect(formatBillingPeriod("month", null)).toBe("per month");
    expect(formatBillingPeriod("month", 0)).toBe("per month");
  });
});

describe("plans — amounts come off the plan", () => {
  it("formats from minor units, in the plan's own currency", () => {
    expect(formatAmount(200, "USD")).toBe("$2");
    expect(formatAmount(250, "USD")).toBe("$2.50");
    expect(formatAmount(10, "USD")).toBe("$0.10");
    expect(formatAmount(200, "EUR")).toBe("2 EUR");
  });

  it("says Free rather than $0 — and never NaN", () => {
    expect(formatAmount(0, "USD")).toBe("Free");
    expect(formatAmount(Number.NaN, "USD")).toBe("Free");
  });
});

describe("nextScheduledLabel — the holder's own cadence, never a constant", () => {
  const NOW = Date.UTC(2026, 7, 17);
  const daysAgo = (n: number) => NOW - n * 86_400_000;

  it("counts down from the interval it is given", () => {
    expect(nextScheduledLabel(daysAgo(47), 60, NOW)).toBe("in 13 days");
    expect(nextScheduledLabel(daysAgo(2), 7, NOW)).toBe("in 5 days");
    // The rehearsal plan bills and recalculates daily — a card that assumed a
    // month would be wrong for it in both directions.
    expect(nextScheduledLabel(daysAgo(0), 1, NOW)).toBe("in 1 day");
    expect(nextScheduledLabel(daysAgo(3), 1, NOW)).toBe("due now");
  });

  it("says due now once the interval has passed, and never goes negative", () => {
    // The worst failure here would be "in -4 days" on someone's account page.
    expect(nextScheduledLabel(daysAgo(64), 60, NOW)).toBe("due now");
    expect(nextScheduledLabel(daysAgo(60), 60, NOW)).toBe("due now");
  });

  it("singularises one day", () => {
    expect(nextScheduledLabel(daysAgo(59), 60, NOW)).toBe("in 1 day");
  });

  it("returns null with no last run — a guess with nothing behind it is fiction", () => {
    expect(nextScheduledLabel(null, 60, NOW)).toBeNull();
    expect(nextScheduledLabel(0, 7, NOW)).toBeNull();
  });

  it("returns null rather than a wrong date when no cadence is known", () => {
    // A subscription response with no policy must not silently borrow 60 days.
    expect(nextScheduledLabel(daysAgo(5), null, NOW)).toBeNull();
    expect(nextScheduledLabel(daysAgo(5), 0, NOW)).toBeNull();
  });
});

describe("cadenceDays", () => {
  it("converts the seconds every policy stores into the days every page says", () => {
    expect(cadenceDays(60 * 86_400)).toBe(60);
    expect(cadenceDays(7 * 86_400)).toBe(7);
    expect(cadenceDays(86_400)).toBe(1);
  });

  it("never rounds a real sub-day cadence down to zero", () => {
    expect(cadenceDays(3600)).toBe(1);
  });

  it("returns null for anything unusable, so callers show a dash", () => {
    expect(cadenceDays(0)).toBeNull();
    expect(cadenceDays(null)).toBeNull();
    expect(cadenceDays(undefined)).toBeNull();
    expect(cadenceDays(Number.NaN)).toBeNull();
  });
});

describe("SUBSCRIPTION_STATUS_LABEL", () => {
  it("is the one wording, because two copies had already drifted", () => {
    // Settings said "Cancelled" while Insights said "Canceled".
    expect(SUBSCRIPTION_STATUS_LABEL.canceled).toBe("Cancelled");
    expect(SUBSCRIPTION_STATUS_LABEL.past_due).toBe("Payment due");
  });
});
