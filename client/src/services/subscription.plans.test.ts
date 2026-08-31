// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { cancelSubscription, fetchPlans, refreshSubscription, setMockSubscription } from "./subscription";

/** Mock mode throughout (VITE_FEATURE_SUBSCRIPTION_API unset in tests). */
describe("the plans seam (mock mode)", () => {
  beforeEach(() => localStorage.clear());

  it("serves the documented two-plan shape, checkout_url complete except ref", async () => {
    const plans = await fetchPlans();
    expect(plans.map((p) => p.tier)).toEqual(["free", "priority"]);
    const paid = plans[1];
    expect(paid.checkoutUrl).toContain("redirect_uri=");
    expect(paid.checkoutUrl).not.toContain("ref=");
    expect(paid.scheduleIntervalSeconds).toBe(7 * 86_400);
  });

  it("lets QA rehearse the self-hosted no-billing state with an empty override", async () => {
    localStorage.setItem("brainstorm_mock_plans", "[]");
    expect(await fetchPlans()).toEqual([]);
  });

  it("normalizes snake_case plans from an override, dropping unknown tiers", async () => {
    localStorage.setItem(
      "brainstorm_mock_plans",
      JSON.stringify([
        { tier: "priority", name: "P", amount_minor: 300, currency: "USD", schedule_interval_seconds: 86400, checkout_url: "https://x/y" },
        { tier: "enterprise", name: "nope" },
      ]),
    );
    const plans = await fetchPlans();
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ tier: "priority", amountMinor: 300, scheduleIntervalSeconds: 86400, checkoutUrl: "https://x/y" });
  });

  // Canceling changes WHETHER they're subscribed, not HOW they paid — a
  // Lightning sub must not read "Card" the moment it's canceled.
  it("canceling keeps the rail it actually knew", async () => {
    setMockSubscription("priority", "active", "flash-lightning");
    await cancelSubscription();
    const sub = await refreshSubscription();
    expect(sub.status).toBe("canceled");
    expect(sub.rail).toBe("flash-lightning");
  });

  it("round-trips pending — the status that used to be forced to none", async () => {
    setMockSubscription("priority", "pending");
    const sub = await refreshSubscription();
    expect(sub.status).toBe("pending");
    expect(sub.tier).toBe("priority");
    expect(sub.manageUrl).toContain("portal");
  });

  // Flash reports a cancellation that has not taken effect as `active` with a
  // date, and the subscriber really is still entitled — so the date has to
  // survive the seam, or the UI shows "renews" to someone who just cancelled.
  it("keeps a scheduled cancellation date alongside an active status", async () => {
    setMockSubscription("priority", "active", "card", 1);
    const sub = await refreshSubscription();
    expect(sub.status).toBe("active");
    expect(sub.cancelEffectiveDate).not.toBeNull();
    expect(new Date(sub.cancelEffectiveDate!).getTime()).toBeGreaterThan(Date.now());
  });

  it("reads the backend's snake_case cancel date", async () => {
    localStorage.setItem(
      "brainstorm_mock_subscription",
      JSON.stringify({
        tier: "priority",
        status: "active",
        cancel_effective_date: "2026-09-01T00:00:00Z",
      }),
    );
    const sub = await refreshSubscription();
    expect(sub.cancelEffectiveDate).toBe("2026-09-01T00:00:00Z");
  });

  it("is null when nothing is scheduled", async () => {
    setMockSubscription("priority", "active", "card");
    expect((await refreshSubscription()).cancelEffectiveDate).toBeNull();
  });
});
