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
    planId: "019e",
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
  planId: null,
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

  // The live staging bug: a daily rehearsal plan and the real monthly one grant
  // the identical policy, so marking by policy marked BOTH and suppressed both
  // calls to action — leaving a subscriber no route between them.
  it("marks only the plan they bought when two plans grant one policy", () => {
    const daily = plan({ planId: "day", amountMinor: 10, billingInterval: "daily" });
    const monthly = plan({ planId: "mon", amountMinor: 200 });
    renderWithProviders(
      <PlanPicker
        plans={[FREE, daily, monthly]}
        currentPolicyId={2}
        currentPlanId="day"
        onChoose={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-current-1")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-current-2")).toBeNull();
    // And the other plan on that policy stays buyable, so switching is possible.
    expect(screen.queryByTestId("plan-cta-1")).toBeNull();
    expect(screen.getByTestId("plan-cta-2")).toBeInTheDocument();
  });

  // The checkout dialog renders ONE row when /pricing preselects a plan. A
  // membership test over the rows on screen would find no match there, fall
  // back to the policy, and mark the plan they are trying to buy as already
  // theirs — a dead-end dialog on the exact switch this ticket exists for.
  it("keeps the other plan buyable even when it is the only row rendered", () => {
    renderWithProviders(
      <PlanPicker
        plans={[plan({ planId: "mon" })]}
        currentPolicyId={2}
        currentPlanId="day"
        onChoose={() => {}}
      />,
    );
    expect(screen.queryByTestId("plan-current-0")).toBeNull();
    expect(screen.getByTestId("plan-cta-0")).toBeInTheDocument();
  });

  // Nobody has bought anything, so there is no plan to match — the free row and
  // a comped account are both marked by the policy they hold.
  it("marks by policy for a holder with no plan behind them", () => {
    renderWithProviders(
      <PlanPicker plans={[FREE, plan()]} currentPolicyId={1} onChoose={() => {}} />,
    );
    expect(screen.getByTestId("plan-current-0")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-current-1")).toBeNull();
  });

  it("leaves a subscriber on a withdrawn plan a route to a current one", () => {
    // Their plan is not on the page at all. Marking the tier would take the
    // call to action off the only row they could move to.
    renderWithProviders(
      <PlanPicker
        plans={[FREE, plan()]}
        currentPolicyId={2}
        currentPlanId="retired"
        onChoose={() => {}}
      />,
    );
    expect(screen.queryByTestId("plan-current-1")).toBeNull();
    expect(screen.getByTestId("plan-cta-1")).toBeInTheDocument();
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

  // The guide's own example plan has `features: null, notIncluded: null`, so
  // copy nobody has written is the DEFAULT case, not an edge one. It must read
  // as an ordinary purchasable card — no empty list, no blank, no missing CTA.
  it("renders a plan nobody has written copy for as a normal card", () => {
    renderWithProviders(
      <PlanPicker
        plans={[plan({ description: null, features: null, notIncluded: null })]}
        currentPolicyId={null}
        onChoose={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-name-0")).toHaveTextContent("Monthly");
    expect(screen.getByTestId("plan-price-0")).toHaveTextContent("$2.00");
    expect(screen.getByTestId("plan-cta-0")).toBeInTheDocument();
    // Not an empty <ul> where the copy would be.
    expect(screen.queryByTestId("plan-copy-0")).toBeNull();
    expect(screen.queryByTestId("plan-description-0")).toBeNull();
  });

  it("keeps includes and excludes as two distinguishable lists", () => {
    renderWithProviders(
      <PlanPicker
        plans={[plan({ features: ["Weekly recalculation"], notIncluded: ["Custom roots"] })]}
        currentPolicyId={null}
        onChoose={() => {}}
      />,
    );
    expect(screen.getByTestId("plan-included-0")).toHaveTextContent("Weekly recalculation");
    expect(screen.getByTestId("plan-included-0")).not.toHaveTextContent("Custom roots");
    expect(screen.getByTestId("plan-excluded-0")).toHaveTextContent("Custom roots");
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
