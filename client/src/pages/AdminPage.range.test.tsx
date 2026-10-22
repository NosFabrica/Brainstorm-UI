// @vitest-environment jsdom
/**
 * One time range for the whole admin dashboard. Picking it in the header
 * changes what every tab asks the backend for; no tab keeps a range of its own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getAdminStats: vi.fn(async () => ({ scoredUsers: 0, spAdopters: 0, queueDepth: 0, totalUsers: 0 })),
  getAdminUsers: vi.fn(async () => ({ items: [], total: 0, pages: 1 })),
  getAdminActivity: vi.fn(async () => ({ items: [], total: 0, pages: 1 })),
  getSchedulingPolicies: vi.fn(async () => []),
  getGrapeRankResult: vi.fn(async () => null),
  getAdminUserHistory: vi.fn(async () => ({ items: [] })),
  getBrainstormPubkey: vi.fn(async () => null),
  triggerUserGraperank: vi.fn(),
}));
vi.mock("@/services/api", () => ({ apiClient: api, isAuthRedirecting: () => false }));
vi.mock("@/services/support", () => ({ ADMIN_SUPPORT_QUERY_KEY: ["support"], adminListTickets: async () => [] }));
vi.mock("@/services/nostr", () => ({ fetchProfile: async () => null, searchNostrProfiles: async () => [] }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ isAdmin: true, pubkey: "a".repeat(64) }),
}));
vi.mock("applesauce-react/hooks", () => ({ useActiveAccount: () => null }));
vi.mock("@/accounts/session", () => ({ hasSession: () => true }));
vi.mock("@/accounts/login-flow", () => ({ logout: () => {} }));
vi.mock("@/components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("@/components/Footer", () => ({ Footer: () => null }));
vi.mock("@/components/PageBackground", () => ({ default: () => null }));
vi.mock("@/components/DeferredSession", () => ({ DeferredSessionNotice: () => null }));
vi.mock("@/components/admin/NostrHealthCard", () => ({ NostrHealthCard: () => null }));
vi.mock("@/components/admin/support/AdminSupportCards", () => ({ AdminSupportCards: () => null }));
vi.mock("@/components/admin/billing/AdminBillingCards", () => ({ AdminBillingCards: () => null }));
vi.mock("@/components/admin/billing/PlanMappingsCard", () => ({ PlanMappingsCard: () => null }));
vi.mock("@/components/admin/scheduling/SchedulingCard", () => ({ SchedulingCard: () => null }));
vi.mock("@/components/admin/scheduling/SchedulingStatsPanel", () => ({ SchedulingStatsPanel: () => null }));
vi.mock("@/components/admin/trusted-lists/TrustedListsCard", () => ({ TrustedListsCard: () => null }));

import AdminPage from "./AdminPage";

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AdminPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/admin");
});

describe("the admin dashboard's time range", () => {
  it("asks the backend for the picked range, for activity and users alike", async () => {
    renderPage();
    await waitFor(() => expect(api.getAdminActivity).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("button-range-7d"));

    // The Overview loads the range and the period before it, for its "vs prior" deltas.
    await waitFor(() => expect(api.getAdminActivity).toHaveBeenLastCalledWith(expect.objectContaining({ days: 14 })));
    expect(api.getAdminUsers).toHaveBeenLastCalledWith(expect.objectContaining({ days: 7 }));
    expect(new URLSearchParams(window.location.search).get("range")).toBe("7d");
  });

  it("gives the Activity tab the same range, and no range of its own", async () => {
    window.history.replaceState({}, "", "/admin?range=7d");
    renderPage();
    fireEvent.click(screen.getByTestId("tab-activity"));

    const panel = await screen.findByTestId("panel-activity");
    expect(within(panel).getByText(/last 7 days/i)).toBeInTheDocument();
    expect(within(panel).queryByTestId("time-range-selector")).toBeNull();
  });

  it("counts every record of the range in the Activity Summary, not only the newest backend page", async () => {
    const stamp = (i: number) => new Date(Date.now() - i * 60_000).toISOString();
    const record = (i: number) => ({
      private_id: i,
      pubkey: "b".repeat(64),
      status: "success",
      created_at: stamp(i),
      updated_at: stamp(i),
    });
    // The backend pages at 100 rows: 250 records in the last 7 days span three pages.
    api.getAdminActivity.mockImplementation(async ({ page = 1 }: { page?: number }) => {
      const from = (page - 1) * 100;
      return {
        items: Array.from({ length: Math.min(100, 250 - from) }, (_, i) => record(from + i)),
        total: 250,
        pages: 3,
      };
    });
    window.history.replaceState({}, "", "/admin?range=7d");
    renderPage();
    fireEvent.click(screen.getByTestId("tab-activity"));

    const panel = await screen.findByTestId("panel-activity");
    await waitFor(() => expect(within(panel).getByTestId("summary-total")).toHaveTextContent("250"));
    expect(within(panel).getByTestId("summary-success")).toHaveTextContent("250");
  });

  it("gives the Users tab the same range, and no range of its own", async () => {
    window.history.replaceState({}, "", "/admin?range=30d");
    renderPage();
    fireEvent.click(screen.getByTestId("tab-users"));

    await screen.findByTestId("panel-users");
    await waitFor(() => expect(api.getAdminUsers).toHaveBeenLastCalledWith(expect.objectContaining({ days: 30 })));
    expect(screen.queryByTestId("select-days-filter")).toBeNull();
  });
});
