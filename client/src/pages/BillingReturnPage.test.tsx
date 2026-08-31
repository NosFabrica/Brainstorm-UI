import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BillingReturnPage from "./BillingReturnPage";
import { fetchSubscription } from "@/services/subscription";

vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));

function renderAt(query: string) {
  window.history.pushState({}, "", `/billing/return${query}`);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <BillingReturnPage />
    </QueryClientProvider>,
  );
}

describe("BillingReturnPage outcomes", () => {
  beforeEach(() => localStorage.clear());

  it('treats "Return without subscribing" (no status) as no payment, never a spinner', async () => {
    renderAt("");
    await waitFor(() => expect(screen.getByTestId("billing-return-none")).toBeInTheDocument());
    expect(screen.queryByTestId("billing-return-pending")).toBeNull();
  });

  it("treats an unknown status the same way — the set is open", async () => {
    renderAt("?status=definitely_new_thing");
    await waitFor(() => expect(screen.getByTestId("billing-return-none")).toBeInTheDocument());
  });

  it("status=active lands on success (mock applies the outcome)", async () => {
    renderAt("?status=active&subscriptionId=x&ref=y");
    await waitFor(() => expect(screen.getByTestId("billing-return-success")).toBeInTheDocument());
  });

  // The redirect says a payment landed, never HOW it was paid, and never which
  // tier — it records the policy the server reports and nothing else.
  it("records the policy the server reports, inventing nothing", async () => {
    renderAt("?status=active&subscriptionId=x&ref=y");
    await waitFor(() => expect(screen.getByTestId("billing-return-success")).toBeInTheDocument());

    const sub = await fetchSubscription();
    expect(sub.policy?.isDefault).toBe(false);
    expect(sub.policy?.name).toBe("Priority");
  });

  it("status=pending shows confirming with the honest half-hour copy", async () => {
    renderAt("?status=pending");
    await waitFor(() => expect(screen.getByTestId("billing-return-pending")).toBeInTheDocument());
    expect(screen.getByTestId("billing-return-pending").textContent).toContain("half an hour");
  });
});
