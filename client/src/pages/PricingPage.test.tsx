// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import PricingPage from "./PricingPage";

vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => false }));
// The chrome and the dialog need an AccountsProvider; neither is what these
// tests are about. The dialog has its own seam — see CheckoutDialog.
vi.mock("@/components/InfoPageLayout", () => ({
  InfoPageLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/billing/CheckoutDialog", () => ({ CheckoutDialog: () => null }));

// Real hook by default; one test needs the failure it cannot produce in mock
// mode, where `fetchPlans` always resolves.
let billingOverride: ReturnType<typeof import("@/hooks/useBillingPlans").useBillingPlans> | null = null;
vi.mock("@/hooks/useBillingPlans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useBillingPlans")>();
  return { useBillingPlans: () => billingOverride ?? actual.useBillingPlans() };
});

/**
 * Mock mode reads `brainstorm_mock_plans`, so the whole page can be driven by
 * the array the server would have sent — which is the point of the change.
 */
function servePlans(rows: unknown[]) {
  localStorage.setItem("brainstorm_mock_plans", JSON.stringify(rows));
}

describe("PricingPage renders whatever is on offer", () => {
  beforeEach(() => {
    localStorage.clear();
    billingOverride = null;
  });

  it("shows a plan the frontend has never heard of", async () => {
    servePlans([
      { policy_id: 1, policy_name: "Free", is_default: true, amount_minor: 0, schedule_interval_seconds: 5_184_000 },
      { policy_id: 4, policy_name: "Rehearsal", amount_minor: 10, currency: "USD", billing_period_unit: "day", billing_period_count: 1, schedule_interval_seconds: 86_400, checkout_url: "https://vault.example/signup/a/b" },
    ]);
    renderWithProviders(<PricingPage />);

    await waitFor(() => expect(screen.getByTestId("plan-picker")).toBeInTheDocument());
    expect(screen.getByTestId("plan-name-1")).toHaveTextContent("Rehearsal");
    expect(screen.getByTestId("plan-price-1")).toHaveTextContent("$0.10");
    expect(screen.getByTestId("plan-period-1")).toHaveTextContent("per day");
  });

  // An empty array is the "no billing on this instance" signal, and it has to
  // take the entry point with it rather than showing an empty picker.
  it("stands the whole surface down when the instance sells nothing", async () => {
    servePlans([]);
    renderWithProviders(<PricingPage />);

    await waitFor(() => expect(screen.getByTestId("pricing-unavailable")).toBeInTheDocument());
    expect(screen.queryByTestId("plan-picker")).toBeNull();
  });

  // The claims on the old free card were product claims, not tier copy — they
  // outlive the card that listed them.
  it("keeps the headline and says what Brainstorm does, keyed to no plan", async () => {
    renderWithProviders(<PricingPage />);
    await waitFor(() => expect(screen.getByTestId("plan-picker")).toBeInTheDocument());
    expect(screen.getByTestId("section-pricing-header")).toBeInTheDocument();
    const claims = screen.getByTestId("pricing-product-claims");
    expect(claims).toHaveTextContent("Search ranked by your network");
    expect(claims).toHaveTextContent("Verified follower count");
    expect(claims).toHaveTextContent("Network alerts");
  });

  // The plans ARE what's on offer, so there is nothing to fall back to — the
  // page says so and keeps everything that is true regardless.
  it("still renders when the plans call fails, and invents no prices", () => {
    billingOverride = {
      plans: undefined,
      billingAvailable: undefined,
      recalcDaysFor: () => 60,
      solePurchasableName: null,
      isLoading: false,
      loadFailed: true,
    };
    renderWithProviders(<PricingPage />);

    expect(screen.getByTestId("pricing-plans-error")).toBeInTheDocument();
    expect(screen.queryByTestId("plan-picker")).toBeNull();
    expect(screen.getByTestId("pricing-product-claims")).toBeInTheDocument();
  });
});
