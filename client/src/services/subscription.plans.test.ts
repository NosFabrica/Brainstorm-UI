// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cancelSubscription, fetchPlans, refreshSubscription, setMockSubscription } from "./subscription";

/** Mock mode throughout (VITE_FEATURE_SUBSCRIPTION_API unset in tests). */
describe("the plans seam (mock mode)", () => {
  beforeEach(() => localStorage.clear());

  it("speaks the server's contract: policy-keyed rows, default first", async () => {
    const plans = await fetchPlans();
    expect(plans.map((p) => p.policyName)).toEqual(["Free", "Priority"]);
    expect(plans[0].isDefault).toBe(true);
    expect(plans[0].checkoutUrl).toBeNull();
    const paid = plans[1];
    expect(paid.isDefault).toBe(false);
    expect(paid.checkoutUrl).toContain("redirect_uri=");
    expect(paid.checkoutUrl).not.toContain("ref=");
    expect(paid.scheduleIntervalSeconds).toBe(7 * 86_400);
    expect(paid.billingPeriodUnit).toBe("month");
    expect(paid.billingPeriodCount).toBe(1);
  });

  it("lets QA rehearse the self-hosted no-billing state with an empty override", async () => {
    localStorage.setItem("brainstorm_mock_plans", "[]");
    expect(await fetchPlans()).toEqual([]);
  });

  // The old normalizer dropped any row whose `tier` it did not recognise,
  // which silently took a purchasable plan off the pricing page. There is
  // nothing left to recognise, so nothing left to drop.
  it("normalizes snake_case and drops nothing it doesn't recognise", async () => {
    localStorage.setItem(
      "brainstorm_mock_plans",
      JSON.stringify([
        {
          policy_id: 7, policy_name: "Yearly", schedule_interval_seconds: 86400,
          is_default: false, billing_period_unit: "year", billing_period_count: 1,
          amount_minor: 2000, currency: "USD", checkout_url: "https://x/y",
          blurb: "Two months free", includes: ["Everything"], excludes: [],
        },
        { policy_id: 9, policy_name: "Mystery", billing_period_unit: "eon", amount_minor: 5 },
      ]),
    );
    const plans = await fetchPlans();
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      policyId: 7, policyName: "Yearly", amountMinor: 2000, scheduleIntervalSeconds: 86400,
      checkoutUrl: "https://x/y", billingPeriodUnit: "year", blurb: "Two months free",
      includes: ["Everything"],
    });
    // An empty list is copy an admin cleared, not copy to render.
    expect(plans[0].excludes).toBeNull();
    expect(plans[1]).toMatchObject({ policyId: 9, policyName: "Mystery", billingPeriodUnit: "eon" });
    expect(plans[1].checkoutUrl).toBeNull();
  });

  // Two plans selling one policy is the yearly case, and the whole reason the
  // picker is flat rather than one card per tier.
  it("keeps two rows that sell the same policy", async () => {
    localStorage.setItem(
      "brainstorm_mock_plans",
      JSON.stringify([
        { policy_id: 2, policy_name: "Priority", amount_minor: 200, currency: "USD", billing_period_unit: "month", billing_period_count: 1, checkout_url: "https://x/m" },
        { policy_id: 2, policy_name: "Priority", amount_minor: 2000, currency: "USD", billing_period_unit: "year", billing_period_count: 1, checkout_url: "https://x/y" },
      ]),
    );
    const plans = await fetchPlans();
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.amountMinor)).toEqual([200, 2000]);
  });

  it("reports the policy the subscriber holds, not a tier string", async () => {
    setMockSubscription(true, "pending");
    const sub = await refreshSubscription();
    expect(sub.status).toBe("pending");
    expect(sub.policy).toMatchObject({ name: "Priority", isDefault: false });
    expect(sub.manageUrl).toContain("portal");
  });

  it("reports the plan they actually bought, with its own period", async () => {
    setMockSubscription(true);
    const sub = await refreshSubscription();
    expect(sub.plan).toMatchObject({ amountMinor: 200, currency: "USD", billingPeriodUnit: "month" });
    // All three dates come off the row — nothing here is date arithmetic.
    expect(sub.currentPeriodStart).not.toBeNull();
    expect(sub.nextBillingDate).not.toBeNull();
  });

  it("canceling changes whether they're subscribed, not what they were on", async () => {
    setMockSubscription(true);
    await cancelSubscription();
    const sub = await refreshSubscription();
    expect(sub.status).toBe("canceled");
    expect(sub.policy?.name).toBe("Priority");
  });

  // Flash reports a cancellation that has not taken effect as `active` with a
  // date, and the subscriber really is still entitled — so the date has to
  // survive the seam, or the UI shows "renews" to someone who just cancelled.
  it("keeps a scheduled cancellation date alongside an active status", async () => {
    setMockSubscription(true, "active", 1);
    const sub = await refreshSubscription();
    expect(sub.status).toBe("active");
    expect(sub.cancelEffectiveDate).not.toBeNull();
    expect(new Date(sub.cancelEffectiveDate!).getTime()).toBeGreaterThan(Date.now());
  });

  it("reads the backend's snake_case shape", async () => {
    localStorage.setItem(
      "brainstorm_mock_subscription",
      JSON.stringify({
        policy: { id: 3, name: "Priority", schedule_interval_seconds: 604800, is_default: false },
        plan: { amount_minor: 10, currency: "USD", is_active: false, billing_period_unit: "day", billing_period_count: 1 },
        status: "active",
        cancel_effective_date: "2026-09-01T00:00:00Z",
        current_period_start: "2026-08-01T00:00:00Z",
        next_billing_date: "2026-09-01T00:00:00Z",
      }),
    );
    const sub = await refreshSubscription();
    expect(sub.policy).toEqual({ id: 3, name: "Priority", scheduleIntervalSeconds: 604800, isDefault: false });
    // A retired mapping still prices what they signed up for, and says so.
    expect(sub.plan).toEqual({ amountMinor: 10, currency: "USD", isActive: false, billingPeriodUnit: "day", billingPeriodCount: 1 });
    expect(sub.cancelEffectiveDate).toBe("2026-09-01T00:00:00Z");
    expect(sub.currentPeriodStart).toBe("2026-08-01T00:00:00Z");
  });

  it("is null when nothing is scheduled", async () => {
    setMockSubscription(true, "active");
    expect((await refreshSubscription()).cancelEffectiveDate).toBeNull();
  });
});
