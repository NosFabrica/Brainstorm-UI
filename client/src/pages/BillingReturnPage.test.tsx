import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import BillingReturnPage from "./BillingReturnPage";
import { apiClient } from "@/services/api";

vi.mock("@/hooks/useHasSession", () => ({ useHasSession: () => true }));
const startCheckoutPoll = vi.fn();
vi.mock("@/lib/checkoutPoll", () => ({ startCheckoutPoll: (...a: unknown[]) => startCheckoutPoll(...a) }));
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
// Enes's spec for `verification` (server 4093c93). Two distinct states, and
// neither may be rendered as a payment still confirming:
//   mismatch — the id exists but names another user, or nobody. "This payment
//              belongs to a different account." No poll. Never say nothing was
//              charged (someone was). Offer: switch account, contact support.
//   unknown  — Flash has no such subscription. "We couldn't find that payment."
//              No poll. Retry from pricing.
// verified / not_given / unavailable keep today's behaviour.
describe("BillingReturnPage verification states", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    api.getSubscription.mockResolvedValue(FREE);
  });

  it("mismatch: a different account's payment — no poll, no 'nothing was charged', switch or support", async () => {
    api.refreshSubscription.mockResolvedValue({ ...FREE, verification: "mismatch" });
    renderAt("?status=active&subscriptionId=sub_stranger&ref=abc");
    const state = await screen.findByTestId("billing-return-mismatch");
    expect(screen.getByRole("heading", { name: /belongs to a different account/i })).toBeInTheDocument();
    expect(state.textContent).not.toMatch(/nothing was charged/i);
    expect(screen.queryByTestId("billing-return-pending")).toBeNull();
    expect(startCheckoutPoll).not.toHaveBeenCalled();
    expect(screen.getByTestId("billing-return-switch-account").getAttribute("href")).toBe("/login?switch=1");
    const support = screen.getByTestId("billing-return-support").getAttribute("href") ?? "";
    expect(support.startsWith("mailto:support@nosfabrica.com?subject=")).toBe(true);
    expect(decodeURIComponent(support)).toContain("sub_stranger");
  });

  it("unknown: Flash has no such payment — no poll, retry from pricing", async () => {
    api.refreshSubscription.mockResolvedValue({ ...FREE, verification: "unknown" });
    renderAt("?status=active&subscriptionId=sub_nope&ref=abc");
    await screen.findByTestId("billing-return-unknown");
    expect(screen.getByRole("heading", { name: /couldn.t find that payment/i })).toBeInTheDocument();
    expect(screen.getByTestId("billing-return-retry").getAttribute("href")).toBe("/pricing");
    expect(startCheckoutPoll).not.toHaveBeenCalled();
    expect(screen.queryByTestId("billing-return-pending")).toBeNull();
  });

  it("unavailable: keep confirming, say Flash couldn't be reached, and poll", async () => {
    api.refreshSubscription.mockResolvedValue({ ...FREE, verification: "unavailable" });
    renderAt("?status=active&subscriptionId=7d3b&ref=abc");
    await waitFor(() => expect(screen.getByTestId("billing-return-pending")).toBeInTheDocument());
    expect(screen.getByTestId("billing-return-unavailable")).toBeInTheDocument();
    expect(startCheckoutPoll).toHaveBeenCalledTimes(1);
  });

  it("verified-but-not-applied, not_given, and an older server without the field all confirm and poll as before", async () => {
    api.refreshSubscription.mockResolvedValue({ ...FREE, verification: "verified" });
    const a = renderAt("?status=active&subscriptionId=7d3b&ref=abc");
    await waitFor(() => expect(screen.getByTestId("billing-return-pending")).toBeInTheDocument());
    expect(screen.queryByTestId("billing-return-unavailable")).toBeNull();
    a.unmount();
    api.refreshSubscription.mockResolvedValue({ ...FREE, verification: "not_given" });
    const b = renderAt("?status=pending");
    await waitFor(() => expect(screen.getByTestId("billing-return-pending")).toBeInTheDocument());
    b.unmount();
    api.refreshSubscription.mockResolvedValue(FREE);
    renderAt("?status=active&subscriptionId=7d3b&ref=abc");
    await waitFor(() => expect(screen.getByTestId("billing-return-pending")).toBeInTheDocument());
    expect(startCheckoutPoll).toHaveBeenCalledTimes(3);
  });
});
