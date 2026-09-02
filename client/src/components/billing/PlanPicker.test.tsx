// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { PlanPicker } from "./PlanPicker";
import type { BillingPlan } from "@/services/subscription";

function plan(over: Partial<BillingPlan> = {}): BillingPlan {
  return {
    policyId: 2,
    policyName: "Priority",
    scheduleIntervalSeconds: 7 * 86_400,
    isDefault: false,
    planName: "Monthly",
    billingInterval: "monthly",
    amountMinor: 200,
    currency: "USD",
    checkoutUrl: "https://vault.example/signup/svc/plan",
    description: null,
    features: null,
    notIncluded: null,
    ...over,
  };
}

const FREE = plan({
  policyId: 1,
  policyName: "Free",
  isDefault: true,
  scheduleIntervalSeconds: 60 * 86_400,
  amountMinor: 0,
  // Nothing sells the free row, so no Flash plan names or prices it.
  planName: null,
  billingInterval: null,
  checkoutUrl: null,
});

describe("PlanPicker — the page is whatever the server says", () => {
  it("renders every row it is given, knowing none of them in advance", () => {
    renderWithProviders(
      <PlanPicker
        plans={[
          FREE,
          plan({ policyId: 5, planName: "Wildcard", amountMinor: 4200, currency: "CAD" }),
        ]}
        currentPolicyId={null}
        onChoose={() => {}}
      />,
    );
    // Flash names a plan; the free row falls back to the policy's own name.
    expect(screen.getByTestId("plan-name-0")).toHaveTextContent("Free");
    expect(screen.getByTestId("plan-name-1")).toHaveTextContent("Wildcard");
    expect(screen.getByTestId("plan-price-1")).toHaveTextContent("CA$42.00");
  });

  // Two rows on one policy is the monthly/yearly case — and the reason the
  // picker is flat rather than one card per tier.
  it("renders two plans that sell the same policy, told apart by price and period", () => {
    renderWithProviders(
      <PlanPicker
        plans={[
          plan({ amountMinor: 200, billingInterval: "monthly" }),
          plan({ amountMinor: 2000, billingInterval: "yearly" }),
        ]}
        currentPolicyId={null}
        onChoose={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-price-0")).toHaveTextContent("$2.00");
    expect(screen.getByTestId("plan-period-0")).toHaveTextContent("per month");
    expect(screen.getByTestId("plan-price-1")).toHaveTextContent("$20.00");
    expect(screen.getByTestId("plan-period-1")).toHaveTextContent("per year");
  });

  it("renders a plan whose period is unfamiliar, and one with none at all", () => {
    // Hiding either would take a purchasable plan off the page, which is the
    // exact failure the old tier whitelist caused. Flash's interval set is
    // theirs to grow, so an unknown word is a case that will happen.
    renderWithProviders(
      <PlanPicker
        plans={[
          plan({ billingInterval: "fortnightly" }),
          plan({ billingInterval: null }),
        ]}
        currentPolicyId={null}
        onChoose={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-period-0")).toHaveTextContent("fortnightly");
    expect(screen.queryByTestId("plan-period-1")).toBeNull();
    expect(screen.getByTestId("plan-cta-1")).toBeInTheDocument();
  });

  // They are on the POLICY, not on a mapping. A subscriber who bought a plan
  // that has since been retired is not in this array at all — matching on the
  // plan would leave nothing marked.
  it("marks the current row by policy, even when their own plan is no longer sold", () => {
    renderWithProviders(
      <PlanPicker
        plans={[FREE, plan({ policyId: 2, amountMinor: 300 })]}
        currentPolicyId={2}
        onChoose={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-current-1")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-current-0")).toBeNull();
    // Nothing to buy on the row you are already on.
    expect(screen.queryByTestId("plan-cta-1")).toBeNull();
  });

  it("gives the free row nothing to buy, and leaves it where the server put it", () => {
    renderWithProviders(
      <PlanPicker plans={[FREE, plan()]} currentPolicyId={null} onChoose={() => {}} />,
    );
    expect(screen.getByTestId("plan-name-0")).toHaveTextContent("Free");
    expect(screen.getByTestId("plan-price-0")).toHaveTextContent("Free");
    expect(screen.queryByTestId("plan-cta-0")).toBeNull();
    expect(screen.getByTestId("plan-cta-1")).toBeInTheDocument();
  });

  it("hands the clicked plan back synchronously, so window.open survives popup blockers", () => {
    const onChoose = vi.fn();
    const yearly = plan({ amountMinor: 2000, billingInterval: "yearly" });
    renderWithProviders(
      <PlanPicker plans={[FREE, plan(), yearly]} currentPolicyId={1} onChoose={onChoose} />,
    );
    fireEvent.click(screen.getByTestId("plan-cta-2"));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(yearly);
  });

  it("renders Flash's copy as text — markup must never become markup", () => {
    renderWithProviders(
      <PlanPicker
        plans={[plan({ description: "<img src=x onerror=alert(1)>", features: ["Everything"], notIncluded: ["Nothing"] })]}
        currentPolicyId={null}
        onChoose={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-description-0")).toHaveTextContent("<img src=x onerror=alert(1)>");
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByTestId("plan-copy-0")).toHaveTextContent("Everything");
    expect(screen.getByTestId("plan-copy-0")).toHaveTextContent("Nothing");
  });

  it("shows nothing rather than a wrong list while the call is in flight", () => {
    renderWithProviders(
      <PlanPicker plans={undefined} currentPolicyId={null} onChoose={() => {}} />,
    );
    expect(screen.getByTestId("plan-picker-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-picker")).toBeNull();
  });

  it("renders an empty array as nothing to sell", () => {
    renderWithProviders(<PlanPicker plans={[]} currentPolicyId={null} onChoose={() => {}} />);
    expect(screen.getByTestId("plan-picker").children).toHaveLength(0);
  });
});
