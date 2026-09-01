import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BillingReturnPage from "./BillingReturnPage";
import { apiClient } from "@/services/api";

vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
vi.mock("@/services/api", () => ({
  apiClient: { getSubscription: vi.fn(), refreshSubscription: vi.fn() },
}));

const api = apiClient as unknown as {
  getSubscription: ReturnType<typeof vi.fn>;
  refreshSubscription: ReturnType<typeof vi.fn>;
};

const FREE = { status: "none", policy: { id: 1, name: "Free", is_default: true } };
const PAID = { status: "active", policy: { id: 2, name: "Priority", is_default: false } };

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
  beforeEach(() => {
    vi.resetAllMocks();
    api.getSubscription.mockResolvedValue(FREE);
    api.refreshSubscription.mockResolvedValue(FREE);
  });

  it('treats "Return without subscribing" (no status) as no payment, never a spinner', async () => {
    renderAt("");
    await waitFor(() => expect(screen.getByTestId("billing-return-none")).toBeInTheDocument());
    expect(screen.queryByTestId("billing-return-pending")).toBeNull();
  });

  it("treats an unknown status the same way — the set is open", async () => {
    renderAt("?status=definitely_new_thing");
    await waitFor(() => expect(screen.getByTestId("billing-return-none")).toBeInTheDocument());
  });

  // The page grants nothing from the redirect: success is what the SERVER
  // reports on refresh, not what the query string claims.
  it("lands on success only once the server reports a paid policy", async () => {
    api.refreshSubscription.mockResolvedValue(PAID);
    renderAt("?status=active&subscriptionId=x&ref=y");
    await waitFor(() => expect(screen.getByTestId("billing-return-success")).toBeInTheDocument());
    expect(screen.getByText("Priority is on")).toBeInTheDocument();
  });

  it("keeps confirming when the redirect says paid but the server has not caught up", async () => {
    renderAt("?status=active&subscriptionId=x&ref=y");
    await waitFor(() => expect(screen.getByTestId("billing-return-pending")).toBeInTheDocument());
  });

  it("status=pending shows confirming, and promises only as long as the poll runs", async () => {
    renderAt("?status=pending");
    await waitFor(() => expect(screen.getByTestId("billing-return-pending")).toBeInTheDocument());
    expect(screen.getByTestId("billing-return-pending").textContent).toContain("ten minutes");
  });
});
