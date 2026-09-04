import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { BillingPlan } from "@/services/subscription";

const fetchPlans = vi.fn<() => Promise<BillingPlan[]>>();
vi.mock("@/services/subscription", () => ({
  fetchPlans: () => fetchPlans(),
}));

import { useBillingPlans } from "./useBillingPlans";

// One scheduling policy — named the way an operator names it — sold as one
// or more Flash plans, named the way a customer sees them.
function plan(over: Partial<BillingPlan>): BillingPlan {
  return {
    policyId: 4,
    policyName: "Paid Staging Flash Test",
    scheduleIntervalSeconds: 604_800,
    isDefault: false,
    planId: "plan-priority",
    planName: "Priority",
    billingInterval: "monthly",
    amountMinor: 200,
    currency: "USD",
    checkoutUrl: "https://flash.example/signup/svc/plan-priority",
    description: null,
    features: null,
    ...over,
  } as BillingPlan;
}

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe("useBillingPlans — what the one thing on sale is called", () => {
  beforeEach(() => fetchPlans.mockReset());

  it("names the plan the way Flash sells it, never by the policy's admin name", async () => {
    fetchPlans.mockResolvedValue([plan({})]);
    const { result } = renderHook(() => useBillingPlans(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.solePurchasableName).toBe("Priority");
  });

  it("says nothing when several plans are on sale, even if they grant one policy", async () => {
    fetchPlans.mockResolvedValue([
      plan({ planId: "plan-daily", planName: "Staging - Daily", billingInterval: "daily", amountMinor: 10 }),
      plan({}),
    ]);
    const { result } = renderHook(() => useBillingPlans(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // Two products, one name would be a guess — the caller says "See plans".
    expect(result.current.solePurchasableName).toBeNull();
  });

  it("falls back to the policy name only when Flash gave the plan none", async () => {
    fetchPlans.mockResolvedValue([plan({ planName: null })]);
    const { result } = renderHook(() => useBillingPlans(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.solePurchasableName).toBe("Paid Staging Flash Test");
  });

  it("ignores plans that cannot be bought — the free row has no checkout", async () => {
    fetchPlans.mockResolvedValue([
      plan({ policyId: 1, policyName: "Free", isDefault: true, planId: null, planName: null, checkoutUrl: null, amountMinor: 0 }),
      plan({}),
    ]);
    const { result } = renderHook(() => useBillingPlans(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.solePurchasableName).toBe("Priority");
  });
});
