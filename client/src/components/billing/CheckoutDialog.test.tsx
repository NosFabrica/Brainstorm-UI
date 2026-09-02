// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { CheckoutDialog } from "./CheckoutDialog";
import type { BillingPlan } from "@/services/subscription";

const PUBKEY = "a".repeat(64);

vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ pubkey: PUBKEY, name: "Test", npub: "npub1test", picture: null, nip05: null }),
}));

const PLAN: BillingPlan = {
  policyId: 2,
  policyName: "Priority",
  scheduleIntervalSeconds: 7 * 86_400,
  isDefault: false,
  planName: "Monthly",
  billingInterval: "monthly",
  amountMinor: 200,
  currency: "USD",
  checkoutUrl: "https://vault.example/signup/svc/plan?redirect_uri=x",
  description: null,
  features: null,
  notIncluded: null,
};

describe("CheckoutDialog", () => {
  beforeEach(() => localStorage.clear());

  it("opens checkout from the click itself, carrying the buyer's ref", () => {
    // Synchronously in the handler, or popup blockers eat it — and `ref` is
    // the entire identity binding, so a window without it is a lost payment.
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    renderWithProviders(<CheckoutDialog open onOpenChange={() => {}} plan={PLAN} />);

    fireEvent.click(screen.getByTestId("plan-cta-0"));

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][0]).toBe(`${PLAN.checkoutUrl}&ref=${PUBKEY}`);
    expect(screen.getByTestId("button-check-again")).toBeInTheDocument();
    open.mockRestore();
  });

  it("names the policy it is selling rather than a hardcoded tier", () => {
    renderWithProviders(
      <CheckoutDialog open onOpenChange={() => {}} plan={{ ...PLAN, policyName: "Rehearsal" }} />,
    );
    expect(screen.getByTestId("checkout-dialog")).toHaveTextContent("Get Rehearsal");
  });
});
