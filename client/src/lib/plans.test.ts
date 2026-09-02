import { describe, it, expect } from "vitest";
import { timeZoneSetter } from "@/test/utils";
import {
  TIER_FEATURES,
  PRODUCT_CLAIM_KEYS,
  cadenceDays,
  plannedFeatures,
  plannedByTheme,
  productClaims,
  formatAmount,
  billingDeadlineMs,
  formatBillingDate,
  formatBillingInterval,
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

describe("plans — the billing interval, formatted not matched", () => {
  it("says every interval Flash documents", () => {
    expect(formatBillingInterval("daily")).toBe("per day");
    expect(formatBillingInterval("weekly")).toBe("per week");
    expect(formatBillingInterval("monthly")).toBe("per month");
    expect(formatBillingInterval("yearly")).toBe("per year");
    expect(formatBillingInterval("one_off")).toBe("one-time");
  });

  it("renders an interval it has never seen rather than dropping the plan", () => {
    // Flash's set can grow. A word we do not know still reads as itself, where
    // matching against a closed list would take a purchasable plan off the page.
    expect(formatBillingInterval("fortnightly")).toBe("fortnightly");
    expect(formatBillingInterval("BLARGH")).toBe("BLARGH");
  });

  it("returns null with no interval, so the row renders with a price alone", () => {
    expect(formatBillingInterval(null)).toBeNull();
    expect(formatBillingInterval("  ")).toBeNull();
  });
});

describe("plans — amounts come off the plan", () => {
  const amount = (minor: number, currency: string) =>
    formatAmount(minor, currency).replace(/\u00a0/g, " ");

  it("formats from minor units, in the plan's own currency", () => {
    expect(amount(200, "USD")).toBe("$2.00");
    expect(amount(250, "USD")).toBe("$2.50");
    expect(amount(10, "USD")).toBe("$0.10");
    expect(amount(200, "EUR")).toBe("€2.00");
  });

  it("says Free rather than $0 — and never NaN", () => {
    expect(formatAmount(0, "USD")).toBe("Free");
    expect(formatAmount(Number.NaN, "USD")).toBe("—");
  });

  it("takes the divisor from the currency, not from a hardcoded 100", () => {
    // Yen has no minor unit. Dividing by 100 rendered ¥100 as ¥1.
    expect(amount(100, "JPY")).toBe("¥100");
    // Dinar has three.
    expect(amount(1000, "BHD")).toBe("BHD 1.000");
  });

  it("prices a sats plan in whole sats", () => {
    // A sat is already bitcoin's smallest unit, so amount_minor holds whole
    // sats — our convention, since the column is transcribed by an admin and
    // never sent by Flash. Intl has no SAT, so it would otherwise throw.
    expect(amount(1, "SAT")).toBe("1 sat");
    expect(amount(2100, "SAT")).toBe("2,100 sats");
    expect(amount(1000, "sats")).toBe("1,000 sats");
  });

  it("falls back rather than throwing on a currency nobody knows", () => {
    expect(amount(500, "ZZZ")).toBe("ZZZ 5.00");
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

/**
 * The shape of the value is what decides, not a rule about which shape Flash
 * will send. The timezone is switched deliberately: the failure being pinned
 * only appears away from UTC, which is where nearly every viewer is.
 */
describe("formatBillingDate — the day, whoever is reading", () => {
  const setTimeZone = timeZoneSetter();

  const inZone = (tz: string, iso: string) => {
    setTimeZone(tz);
    return formatBillingDate(iso);
  };

  it("shows the day named, west and east of UTC, when no time was given", () => {
    expect(inZone("America/Los_Angeles", "2026-09-20")).toBe("Sep 20, 2026");
    expect(inZone("Pacific/Kiritimati", "2026-09-20")).toBe("Sep 20, 2026");
  });

  it("localises a value that carries a real time, because there is one to localise", () => {
    expect(inZone("America/Los_Angeles", "2026-09-20T02:00:00Z")).toBe("Sep 19, 2026");
    expect(inZone("Europe/Berlin", "2026-09-20T23:00:00Z")).toBe("Sep 21, 2026");
  });

  it("shows a dash rather than an invented day", () => {
    expect(formatBillingDate(null)).toBe("—");
    expect(formatBillingDate(undefined)).toBe("—");
    expect(formatBillingDate("not a date")).toBe("—");
  });
});

describe("billingDeadlineMs — still ahead of us?", () => {
  const setTimeZone = timeZoneSetter();

  it("runs a bare date to the end of its day, so a notice does not retire early", () => {
    setTimeZone("America/Los_Angeles");

    expect(billingDeadlineMs("2026-09-20")).toBe(new Date(2026, 8, 20, 23, 59, 59, 999).getTime());
    expect(billingDeadlineMs("2026-09-20")!).toBeGreaterThan(new Date(2026, 8, 20, 10, 0).getTime());
  });

  it("takes a value carrying a time exactly as sent", () => {
    expect(billingDeadlineMs("2026-09-20T14:03:11Z")).toBe(Date.parse("2026-09-20T14:03:11Z"));
  });

  it("is null when there is nothing to compare against", () => {
    expect(billingDeadlineMs(null)).toBeNull();
    expect(billingDeadlineMs("not a date")).toBeNull();
  });
});
