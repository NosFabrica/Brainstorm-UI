// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPlans, refreshSubscription } from "./subscription";
import { apiClient } from "@/services/api";

vi.mock("@/services/api", () => ({
  apiClient: {
    getBillingPlans: vi.fn(),
    getSubscription: vi.fn(),
    refreshSubscription: vi.fn(),
  },
}));

const api = apiClient as unknown as {
  getBillingPlans: ReturnType<typeof vi.fn>;
  refreshSubscription: ReturnType<typeof vi.fn>;
};

/** The seam only ever reads the server — there is no other source. */
describe("the plans seam", () => {
  beforeEach(() => vi.resetAllMocks());

  it("keeps the server's order and never sorts", async () => {
    api.getBillingPlans.mockResolvedValue({
      plans: [
        { policy_id: 1, policy_name: "Free", is_default: true, amount_minor: 0 },
        { policy_id: 2, policy_name: "Priority", plan_name: "Monthly", amount_minor: 200, currency: "USD", billing_interval: "monthly", checkout_url: "https://x/m", schedule_interval_seconds: 604800 },
      ],
    });
    const plans = await fetchPlans();
    expect(plans.map((p) => p.policyName)).toEqual(["Free", "Priority"]);
    expect(plans[0].isDefault).toBe(true);
    expect(plans[0].checkoutUrl).toBeNull();
    // Nothing sells the free row, so no Flash plan names or prices it.
    expect(plans[0].planName).toBeNull();
    expect(plans[1].scheduleIntervalSeconds).toBe(604800);
    expect(plans[1].planName).toBe("Monthly");
    expect(plans[1].billingInterval).toBe("monthly");
  });

  // An empty array is the "no billing on this instance" signal (handoff A8).
  it("passes an empty offer through untouched", async () => {
    api.getBillingPlans.mockResolvedValue({ plans: [] });
    expect(await fetchPlans()).toEqual([]);
  });

  it("survives a response with no plans key at all", async () => {
    api.getBillingPlans.mockResolvedValue({});
    expect(await fetchPlans()).toEqual([]);
  });

  // The old normalizer dropped any row whose `tier` it did not recognise,
  // which silently took a purchasable plan off the pricing page. There is
  // nothing left to recognise, so nothing left to drop.
  it("normalizes snake_case and drops nothing it doesn't recognise", async () => {
    api.getBillingPlans.mockResolvedValue({
      plans: [
        {
          policy_id: 7, policy_name: "Priority", plan_name: "Yearly",
          schedule_interval_seconds: 86400, is_default: false,
          billing_interval: "yearly", amount_minor: 2000, currency: "USD",
          checkout_url: "https://x/y", description: "Two months free",
          features: ["Everything"], not_included: [],
        },
        { policy_id: 9, policy_name: "Mystery", billing_interval: "eon", amount_minor: 5 },
      ],
    });
    const plans = await fetchPlans();
    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      policyId: 7, policyName: "Priority", planName: "Yearly", amountMinor: 2000,
      scheduleIntervalSeconds: 86400, checkoutUrl: "https://x/y",
      billingInterval: "yearly", description: "Two months free",
      features: ["Everything"],
    });
    // An empty list is copy Flash cleared, not copy to render.
    expect(plans[0].notIncluded).toBeNull();
    // A cadence Flash has started sending and we have never seen still renders.
    expect(plans[1]).toMatchObject({ policyId: 9, policyName: "Mystery", billingInterval: "eon" });
    expect(plans[1].checkoutUrl).toBeNull();
  });

  // Two plans selling one policy is the yearly case, and the whole reason the
  // picker is flat rather than one card per tier.
  it("keeps two rows that sell the same policy", async () => {
    api.getBillingPlans.mockResolvedValue({
      plans: [
        { policy_id: 2, policy_name: "Priority", plan_name: "Monthly", amount_minor: 200, currency: "USD", billing_interval: "monthly", checkout_url: "https://x/m" },
        { policy_id: 2, policy_name: "Priority", plan_name: "Yearly", amount_minor: 2000, currency: "USD", billing_interval: "yearly", checkout_url: "https://x/y" },
      ],
    });
    const plans = await fetchPlans();
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.amountMinor)).toEqual([200, 2000]);
  });
});

describe("the subscription seam", () => {
  beforeEach(() => vi.resetAllMocks());

  it("reads the backend's snake_case shape", async () => {
    api.refreshSubscription.mockResolvedValue({
      policy: { id: 3, name: "Priority", schedule_interval_seconds: 604800, is_default: false },
      plan: { amount_minor: 10, currency: "USD", is_active: false, billing_interval: "daily" },
      status: "active",
      cancel_effective_date: "2026-09-01T00:00:00Z",
      current_period_start: "2026-08-01T00:00:00Z",
      next_billing_date: "2026-09-01T00:00:00Z",
      manage_url: "https://vault.example/subscriptions/portal/abc",
    });
    const sub = await refreshSubscription();
    expect(sub.policy).toEqual({ id: 3, name: "Priority", scheduleIntervalSeconds: 604800, isDefault: false });
    // Which plan is still theirs; the price on it is Flash's answer about it.
    expect(sub.plan).toEqual({ amountMinor: 10, currency: "USD", isActive: false, billingInterval: "daily" });
    expect(sub.currentPeriodStart).toBe("2026-08-01T00:00:00Z");
    expect(sub.manageUrl).toContain("portal");
  });

  // Flash reports a cancellation that has not taken effect as `active` with a
  // date, and the subscriber really is still entitled — so the date has to
  // survive the seam, or the UI shows "renews" to someone who just cancelled.
  it("keeps a scheduled cancellation date alongside an active status", async () => {
    api.refreshSubscription.mockResolvedValue({
      status: "active",
      policy: { id: 2, name: "Priority", is_default: false },
      cancel_effective_date: "2026-09-01T00:00:00Z",
    });
    const sub = await refreshSubscription();
    expect(sub.status).toBe("active");
    expect(sub.cancelEffectiveDate).toBe("2026-09-01T00:00:00Z");
  });

  it("is null when nothing is scheduled", async () => {
    api.refreshSubscription.mockResolvedValue({ status: "active", policy: { id: 2, name: "Priority" } });
    expect((await refreshSubscription()).cancelEffectiveDate).toBeNull();
  });

  // A backend hiccup must never read as "paid", and an unrecognised status is
  // exactly that kind of hiccup.
  it("degrades an unrecognised payload to nothing bought", async () => {
    api.refreshSubscription.mockResolvedValue({ status: "wat", policy: "nonsense" });
    const sub = await refreshSubscription();
    expect(sub.status).toBe("none");
    expect(sub.policy).toBeNull();
    expect(sub.plan).toBeNull();
  });
});
