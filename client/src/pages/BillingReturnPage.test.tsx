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

describe("BillingReturnPage verification", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getSubscription.mockResolvedValue(FREE);
    api.refreshSubscription.mockResolvedValue(PAID);
  });

  // The guide's §5: verify the subscription the redirect names. The id is a
  // handle for the server's own lookup, never an authority — the server checks
  // it carries the signed-in caller's reference before granting anything.
  it("passes the redirect's subscriptionId to the server to verify", async () => {
    renderAt("?status=active&subscriptionId=7d3b&ref=abc");
    await waitFor(() => expect(api.refreshSubscription).toHaveBeenCalledWith("7d3b"));
  });

  it("passes no id for a pending return, which carries none", async () => {
    api.refreshSubscription.mockResolvedValue(FREE);
    renderAt("?status=pending&ref=abc");
    await waitFor(() => expect(api.refreshSubscription).toHaveBeenCalledWith(undefined));
  });
});

// Server 4093c93 (Enes, 2026-09-04): the refresh now says what the redirect's
// id turned out to be — `verified`, `mismatch` (names someone else or nobody),
// `unknown` (Flash has no such subscription), `not_given` (a pending return),
// `unavailable` (Flash could not be asked). A refused id must not be rendered
// as a payment still confirming.
describe("BillingReturnPage refused ids", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getSubscription.mockResolvedValue(FREE);
  });

  it("an id Flash says names someone else is refused, not left confirming", async () => {
    api.refreshSubscription.mockResolvedValue({ ...FREE, verification: "mismatch" });
    renderAt("?status=active&subscriptionId=stranger&ref=abc");
    await waitFor(() => expect(screen.getByTestId("billing-return-refused")).toBeInTheDocument());
    expect(screen.queryByTestId("billing-return-pending")).toBeNull();
    expect(screen.getByRole("heading", { name: /couldn.t verify that payment/i })).toBeInTheDocument();
  });

  it("an id Flash has never heard of is refused the same way", async () => {
    api.refreshSubscription.mockResolvedValue({ ...FREE, verification: "unknown" });
    renderAt("?status=active&subscriptionId=nope&ref=abc");
    await waitFor(() => expect(screen.getByTestId("billing-return-refused")).toBeInTheDocument());
  });

  it("when Flash could not be asked, keep confirming and say so", async () => {
    api.refreshSubscription.mockResolvedValue({ ...FREE, verification: "unavailable" });
    renderAt("?status=active&subscriptionId=7d3b&ref=abc");
    await waitFor(() => expect(screen.getByTestId("billing-return-pending")).toBeInTheDocument());
    expect(screen.getByTestId("billing-return-unavailable")).toBeInTheDocument();
  });

  it("a verified id the server hasn't applied yet still confirms — and an older server without the field behaves as before", async () => {
    api.refreshSubscription.mockResolvedValue({ ...FREE, verification: "verified" });
    const first = renderAt("?status=active&subscriptionId=7d3b&ref=abc");
    await waitFor(() => expect(screen.getByTestId("billing-return-pending")).toBeInTheDocument());
    expect(screen.queryByTestId("billing-return-unavailable")).toBeNull();
    first.unmount();
    api.refreshSubscription.mockResolvedValue(FREE); // no `verification` at all
    renderAt("?status=active&subscriptionId=7d3b&ref=abc");
    await waitFor(() => expect(screen.getByTestId("billing-return-pending")).toBeInTheDocument());
  });
});
