// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PlanCard } from "./PlanCard";
import type { BillingPlan, Subscription } from "@/services/subscription";

let sub: Subscription;
let plans: BillingPlan[] | undefined;

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({
    subscription: sub,
    policy: sub.policy,
    plan: sub.plan,
    isPaid: sub.policy !== null && !sub.policy.isDefault,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: sub.currentPeriodEnd,
    nextBillingDate: sub.nextBillingDate,
    cancelEffectiveDate: sub.cancelEffectiveDate,
    manageUrl: sub.manageUrl,
    isActive: sub.status === "active" || sub.status === "grace",
    isLoading: false,
    refetch: () => {},
  }),
}));

vi.mock("@/hooks/useBillingPlans", () => ({
  useBillingPlans: () => ({
    plans,
    billingAvailable: plans === undefined ? undefined : plans.length > 0,
    recalcDaysFor: (p: BillingPlan | undefined) =>
      p?.scheduleIntervalSeconds ? Math.round(p.scheduleIntervalSeconds / 86_400) : 60,
    solePurchasableName:
      Array.from(new Set((plans ?? []).filter((p) => p.checkoutUrl).map((p) => p.policyName))).length === 1
        ? (plans ?? []).find((p) => p.checkoutUrl)!.policyName
        : null,
    isLoading: false,
    loadFailed: false,
  }),
}));

const PAID_ROW: BillingPlan = {
  policyId: 2,
  policyName: "Priority",
  scheduleIntervalSeconds: 7 * 86_400,
  isDefault: false,
  billingPeriodUnit: "month",
  billingPeriodCount: 1,
  amountMinor: 200,
  currency: "USD",
  checkoutUrl: "https://vault.example/signup/a/b",
  blurb: null,
  includes: null,
  excludes: null,
};

const FREE_ROW: BillingPlan = {
  ...PAID_ROW,
  policyId: 1,
  policyName: "Free",
  isDefault: true,
  scheduleIntervalSeconds: 60 * 86_400,
  amountMinor: 0,
  billingPeriodUnit: null,
  billingPeriodCount: null,
  checkoutUrl: null,
};

const FREE_SUB: Subscription = {
  policy: { id: 1, name: "Free", scheduleIntervalSeconds: 60 * 86_400, isDefault: true },
  plan: null,
  status: "none",
  currentPeriodStart: null,
  currentPeriodEnd: null,
  nextBillingDate: null,
  cancelEffectiveDate: null,
  manageUrl: null,
};

function paidSub(over: Partial<Subscription> = {}): Subscription {
  return {
    policy: { id: 2, name: "Priority", scheduleIntervalSeconds: 7 * 86_400, isDefault: false },
    plan: {
      amountMinor: 200,
      currency: "USD",
      isActive: true,
      billingPeriodUnit: "month",
      billingPeriodCount: 1,
    },
    status: "active",
    currentPeriodStart: "2026-08-01T12:00:00Z",
    currentPeriodEnd: "2099-09-01T12:00:00Z",
    nextBillingDate: "2099-09-01T12:00:00Z",
    cancelEffectiveDate: null,
    manageUrl: "https://vault.example/portal/svc",
    ...over,
  };
}

beforeEach(() => {
  sub = paidSub();
  plans = [FREE_ROW, PAID_ROW];
});

describe("PlanCard — the policy they hold, at its live cadence", () => {
  it("names the policy and prices the plan they bought", () => {
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.getByTestId("insights-plan-name")).toHaveTextContent("Priority");
    expect(screen.getByTestId("insights-plan-name")).toHaveTextContent("$2 per month");
  });

  it("takes the cadence from the policy, so retuning it needs no deploy", () => {
    sub = paidSub({
      policy: { id: 9, name: "Staging-Daily", scheduleIntervalSeconds: 86_400, isDefault: false },
    });
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.getByTestId("insights-recalc")).toHaveTextContent("every day");
  });

  it("gives a free holder their own real cadence, not the paid one", () => {
    sub = FREE_SUB;
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.getByTestId("insights-plan-name")).toHaveTextContent("Free");
    expect(screen.getByTestId("insights-recalc")).toHaveTextContent("every 60 days");
  });

  it("counts down to the next run from that same cadence", () => {
    sub = paidSub({
      policy: { id: 2, name: "Priority", scheduleIntervalSeconds: 7 * 86_400, isDefault: false },
    });
    renderWithProviders(<PlanCard lastCalculatedMs={Date.now() - 2 * 86_400_000} />);
    expect(screen.getByTestId("insights-next-run")).toHaveTextContent("in 5 days");
  });

  it("says nothing rather than guessing when there is no cadence", () => {
    sub = { ...FREE_SUB, policy: null };
    renderWithProviders(<PlanCard lastCalculatedMs={Date.now() - 2 * 86_400_000} />);
    expect(screen.getByTestId("insights-recalc")).toHaveTextContent("—");
    expect(screen.getByTestId("insights-next-run")).toHaveTextContent("—");
  });
});

describe("PlanCard — cancellation, and what we cannot know", () => {
  // Flash reports a cancelled-but-still-running subscription as `active`.
  it("shows when access ends, not when it renews, once cancellation is scheduled", () => {
    sub = paidSub({ status: "active", cancelEffectiveDate: "2099-10-05T12:00:00Z" });
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.getByTestId("insights-plan-card")).toHaveTextContent("Access until");
    expect(screen.getByTestId("insights-renews")).toHaveTextContent("Oct 5, 2099");
  });

  it("says Renews while nothing is cancelled", () => {
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.getByTestId("insights-plan-card")).toHaveTextContent("Renews");
  });

  it("shows no payment method, because none is knowable", () => {
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.getByTestId("insights-plan-card")).not.toHaveTextContent("Paid by");
  });

  it("uses the one status wording the whole app shares", () => {
    sub = paidSub({ status: "canceled" });
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.getByTestId("insights-plan-status")).toHaveTextContent("Cancelled");
  });
});

describe("PlanCard — the quiet upsell", () => {
  it("names the one thing on sale and its real cadence", () => {
    sub = FREE_SUB;
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.getByTestId("insights-plan-link")).toHaveTextContent(
      "Priority recalculates every 7 days",
    );
  });

  it("stays generic when several policies are on sale", () => {
    sub = FREE_SUB;
    plans = [FREE_ROW, PAID_ROW, { ...PAID_ROW, policyId: 3, policyName: "Pro" }];
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.getByTestId("insights-plan-link")).toHaveTextContent("See what's on offer");
  });

  it("disappears on an instance that sells nothing", () => {
    sub = FREE_SUB;
    plans = [];
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.queryByTestId("insights-plan-link")).toBeNull();
  });

  it("is not shown to someone already paying", () => {
    renderWithProviders(<PlanCard lastCalculatedMs={null} />);
    expect(screen.queryByTestId("insights-plan-link")).toBeNull();
  });
});
