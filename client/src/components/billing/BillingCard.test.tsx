// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders, timeZoneSetter } from "@/test/utils";
import { BillingCard } from "./BillingCard";
import type { BillingPlan, Subscription } from "@/services/subscription";

// Both seams are hooks, so the card can be driven by exactly the response the
// server would have sent — which is the whole point of the change.
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
    recalcDaysFor: () => 60,
    solePurchasableName: "Priority",
    isLoading: false,
    loadFailed: false,
  }),
}));

const FREE_ROW: BillingPlan = {
  policyId: 1,
  policyName: "Free",
  scheduleIntervalSeconds: 60 * 86_400,
  isDefault: true,
  planName: null,
  billingInterval: null,
  amountMinor: 0,
  currency: "USD",
  checkoutUrl: null,
  description: null,
  features: null,
  notIncluded: null,
};

const PAID_ROW: BillingPlan = {
  ...FREE_ROW,
  policyId: 2,
  policyName: "Priority",
  isDefault: false,
  scheduleIntervalSeconds: 7 * 86_400,
  planName: "Monthly",
  billingInterval: "monthly",
  amountMinor: 200,
  checkoutUrl: "https://vault.example/signup/a/b",
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
      billingInterval: "monthly",
    },
    status: "active",
    currentPeriodStart: "2026-08-01T12:00:00Z",
    currentPeriodEnd: "2026-09-01T12:00:00Z",
    nextBillingDate: "2026-09-01T12:00:00Z",
    cancelEffectiveDate: null,
    manageUrl: "https://vault.example/portal/svc",
    ...over,
  };
}

beforeEach(() => {
  sub = paidSub();
  plans = [FREE_ROW, PAID_ROW];
});

describe("BillingCard — every date is reported, never worked out", () => {
  it("shows the period the server sent, both ends of it", () => {
    renderWithProviders(<BillingCard />);
    const row = screen.getByTestId("billing-payment-row");
    expect(row).toHaveTextContent("Aug 1, 2026");
    expect(row).toHaveTextContent("Sep 1, 2026");
  });

  // The bug this replaces: the start was `periodEnd - 1 month`, which is wrong
  // for the daily rehearsal plan in one direction and a yearly one in the other.
  it("shows a one-day period for a daily plan, not a month", () => {
    sub = paidSub({
      plan: { amountMinor: 10, currency: "USD", isActive: true, billingInterval: "daily" },
      currentPeriodStart: "2026-08-16T12:00:00Z",
      currentPeriodEnd: "2026-08-17T12:00:00Z",
      nextBillingDate: "2026-08-17T12:00:00Z",
    });
    renderWithProviders(<BillingCard />);
    const row = screen.getByTestId("billing-payment-row");
    expect(row).toHaveTextContent("Aug 16, 2026");
    expect(row).toHaveTextContent("Aug 17, 2026");
    expect(row).not.toHaveTextContent("Jul");
    expect(screen.getByTestId("billing-amount")).toHaveTextContent("$0.10 per day");
  });

  it("shows a yearly period as a year", () => {
    sub = paidSub({
      plan: { amountMinor: 2000, currency: "USD", isActive: true, billingInterval: "yearly" },
      currentPeriodStart: "2026-01-01T12:00:00Z",
      currentPeriodEnd: "2027-01-01T12:00:00Z",
      nextBillingDate: "2027-01-01T12:00:00Z",
    });
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-payment-row")).toHaveTextContent("Jan 1, 2026");
    expect(screen.getByTestId("billing-next-invoice")).toHaveTextContent("Jan 1, 2027");
    expect(screen.getByTestId("billing-amount")).toHaveTextContent("$20.00 per year");
  });

  it("bills the next invoice from next_billing_date, not from the period end", () => {
    sub = paidSub({ currentPeriodEnd: "2026-09-01T12:00:00Z", nextBillingDate: "2026-09-04T12:00:00Z" });
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-next-invoice")).toHaveTextContent("Sep 4, 2026");
  });
});

describe("BillingCard — the price is what this subscriber is charged", () => {
  it("prices from the plan they bought, not from the plan on sale today", () => {
    // Repriced since they signed up: the picker says $3, their row says $2.
    plans = [FREE_ROW, { ...PAID_ROW, amountMinor: 300 }];
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-amount")).toHaveTextContent("$2.00 per month");
  });

  it("names the policy they hold", () => {
    sub = paidSub({
      policy: { id: 9, name: "Staging-Daily", scheduleIntervalSeconds: 86_400, isDefault: false },
    });
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-plan")).toHaveTextContent("Staging-Daily");
  });

  it("shows a free holder the free row's own amount rather than a literal", () => {
    sub = FREE_SUB;
    plans = [{ ...FREE_ROW, amountMinor: 0 }, PAID_ROW];
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-amount")).toHaveTextContent("Free");
    expect(screen.getByTestId("billing-status")).toHaveTextContent("Free plan");
    expect(screen.getByTestId("billing-no-payments")).toBeInTheDocument();
  });

  // The price is the snapshot Flash took at signup, read server-side off this
  // subscriber's own row. Where Flash recorded none the server sends nothing
  // rather than the plan's current price, and "Free" for someone who is being
  // charged is the one reading that must not happen.
  it("says nothing about the price when the server sent none", () => {
    sub = paidSub({
      plan: { amountMinor: null, currency: null, isActive: true, billingInterval: null },
    });
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-amount")).toHaveTextContent("—");
    expect(screen.getByTestId("billing-amount")).not.toHaveTextContent("Free");
  });

  it("renders a currency it was given rather than assuming dollars", () => {
    sub = paidSub({
      plan: { amountMinor: 500, currency: "EUR", isActive: true, billingInterval: "monthly" },
    });
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-amount")).toHaveTextContent("€5.00 per month");
  });
});

describe("BillingCard — retired plans, cancellation and what we cannot know", () => {
  it("tells a subscriber whose plan is no longer sold, and offers both exits", () => {
    sub = paidSub({
      plan: { amountMinor: 200, currency: "USD", isActive: false, billingInterval: "monthly" },
    });
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-plan-retired")).toBeInTheDocument();
    expect(screen.getByTestId("billing-retired-pricing")).toHaveAttribute("href", "/pricing");
    expect(screen.getByTestId("billing-retired-manage")).toHaveAttribute(
      "href",
      "https://vault.example/portal/svc",
    );
    // They keep paying what they signed up at.
    expect(screen.getByTestId("billing-amount")).toHaveTextContent("$2.00 per month");
  });

  it("says nothing about retirement for a plan still on sale", () => {
    renderWithProviders(<BillingCard />);
    expect(screen.queryByTestId("billing-plan-retired")).toBeNull();
  });

  // Flash reports a cancelled-but-still-running subscription as `active`, so
  // status alone cannot tell "renews then" from "ends then".
  it("shows when access ends, not a next invoice, once cancellation is scheduled", () => {
    sub = paidSub({ status: "active", cancelEffectiveDate: "2099-09-01T12:00:00Z" });
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-next-label")).toHaveTextContent("Access until");
    expect(screen.getByTestId("billing-next-invoice")).toHaveTextContent("Sep 1, 2099");
    expect(screen.getByTestId("billing-status")).toHaveTextContent("Cancelling");
    expect(screen.queryByTestId("billing-cancel")).toBeNull();
  });

  it("keeps showing a next invoice while nothing is cancelled", () => {
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-next-label")).toHaveTextContent("Next invoice");
  });

  it("offers cancelling when the server says where to do it", () => {
    renderWithProviders(<BillingCard />);
    expect(screen.getByTestId("billing-cancel")).toBeInTheDocument();
  });

  // Cancel is gated on having a portal to send them to, and nothing else.
  it("offers no cancel at all when there is no portal to send them to", () => {
    sub = paidSub({ manageUrl: null });
    renderWithProviders(<BillingCard />);
    expect(screen.queryByTestId("billing-cancel")).toBeNull();
    expect(screen.queryByTestId("billing-manage")).toBeNull();
  });

  it("hands cancellation to the portal the server named", () => {
    renderWithProviders(<BillingCard />);
    fireEvent.click(screen.getByTestId("billing-cancel"));
    expect(screen.getByTestId("billing-cancel-confirm")).toBeInTheDocument();
    expect(screen.getByTestId("billing-manage")).toBeInTheDocument();
  });

  it("shows no payment method, because none is knowable", () => {
    renderWithProviders(<BillingCard />);
    expect(screen.queryByTestId("billing-rail")).toBeNull();
    expect(screen.getByTestId("settings-billing-card")).not.toHaveTextContent("Payment method");
    expect(screen.getByTestId("settings-billing-card")).not.toHaveTextContent("Lightning");
  });

  it("stands the plan CTA down when the instance sells nothing", () => {
    sub = FREE_SUB;
    plans = [];
    renderWithProviders(<BillingCard />);
    expect(screen.queryByTestId("billing-change-plan")).toBeNull();
  });
});

describe("BillingCard — the day Flash named, wherever the viewer is", () => {
  const setTimeZone = timeZoneSetter();

  it("shows a date-only period as the days named, west of UTC", () => {
    setTimeZone("America/Los_Angeles");
    sub = paidSub({ currentPeriodStart: "2026-08-20", currentPeriodEnd: "2026-09-20" });

    renderWithProviders(<BillingCard />);

    const row = screen.getByTestId("billing-payment-row");
    expect(row).toHaveTextContent("Aug 20, 2026");
    expect(row).toHaveTextContent("Sep 20, 2026");
  });

  // Read as midnight, a cancellation dated today is already past by breakfast.
  it("still says access is ending on the very day it ends", () => {
    setTimeZone("America/Los_Angeles");
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    sub = paidSub({ status: "active", cancelEffectiveDate: today });

    renderWithProviders(<BillingCard />);

    expect(screen.getByTestId("billing-next-label")).toHaveTextContent("Access until");
    expect(screen.getByTestId("billing-status")).toHaveTextContent("Cancelling");
  });
});
