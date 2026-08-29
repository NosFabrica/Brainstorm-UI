import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AdminBillingSubscription } from "@/services/api";
import { AdminBillingCards } from "./AdminBillingCards";

const getAdminBillingSubscriptions = vi.fn<() => Promise<AdminBillingSubscription[]>>();
vi.mock("@/services/api", () => ({
  apiClient: {
    getAdminBillingSubscriptions: () => getAdminBillingSubscriptions(),
  },
}));

const PUBKEY = "a".repeat(64);

function renderCards() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminBillingCards active />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminBillingCards", () => {
  it("lists attributed subscribers and quarantines ref-less signups separately", async () => {
    getAdminBillingSubscriptions.mockResolvedValue([
      {
        subscription_id: "sub_1",
        ref: PUBKEY,
        plan_id: "plan_a",
        plan_name: "Priority",
        status: "active",
        current_period_end: "2026-09-25T00:00:00.000Z",
        next_billing_date: "2026-09-25T00:00:00.000Z",
        created_at: "2026-08-25T00:00:00.000Z",
      },
      {
        subscription_id: "sub_2",
        ref: null,
        plan_id: "plan_a",
        plan_name: "Priority",
        status: "active",
        current_period_end: null,
        next_billing_date: null,
        created_at: "2026-08-20T00:00:00.000Z",
      },
    ]);

    renderCards();

    await waitFor(() => expect(screen.getByTestId("table-billing-subscribers")).toBeInTheDocument());
    // The attributed row shows the subscriber as an npub, not raw hex.
    expect(screen.getByTestId("billing-sub-sub_1").textContent).toContain("npub1");
    expect(screen.getByTestId("billing-sub-sub_1").textContent).toContain("Priority");
    // The bypass signup appears ONLY in the unattributed card.
    expect(screen.getByTestId("card-billing-unattributed").textContent).toContain("sub_2");
    expect(screen.queryByTestId("billing-sub-sub_2")).toBeNull();
  });

  it("says so plainly when every signup is attributed", async () => {
    getAdminBillingSubscriptions.mockResolvedValue([]);

    renderCards();

    await waitFor(() => expect(screen.getByTestId("billing-subscribers-empty")).toBeInTheDocument());
    expect(screen.getByTestId("billing-unattributed-empty")).toBeInTheDocument();
  });

  it("shows an honest error state when the endpoint isn't there yet", async () => {
    getAdminBillingSubscriptions.mockRejectedValue(new Error("Failed to fetch billing subscriptions (404)"));

    renderCards();

    // The component retries once by design, so the error surfaces after a beat.
    await waitFor(() => expect(screen.getByTestId("billing-subscribers-error")).toBeInTheDocument(), {
      timeout: 4000,
    });
  });
});
