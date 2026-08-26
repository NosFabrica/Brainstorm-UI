// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { fetchPlans, refreshSubscription, setMockSubscription } from "./subscription";

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

  it("round-trips pending — the status that used to be forced to none", async () => {
    setMockSubscription("priority", "pending");
    const sub = await refreshSubscription();
    expect(sub.status).toBe("pending");
    expect(sub.tier).toBe("priority");
    expect(sub.manageUrl).toContain("portal");
  });
});
