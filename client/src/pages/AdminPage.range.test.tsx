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
vi.mock("@/services/trustSource", () => ({ resolveHouseObserver: async () => null }));
vi.mock("@/services/wotRanks", () => ({ fetchAuthorRanks: async () => ({ ranks: new Map(), source: null }) }));
vi.mock("@/hooks/useActiveAccountDisplay", () => ({
  useActiveAccountDisplay: () => ({ isAdmin: true, pubkey: "a".repeat(64) }),
}));
vi.mock("applesauce-react/hooks", () => ({ useActiveAccount: () => null, use$: () => undefined }));
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
const growth = vi.hoisted(() => vi.fn((_props: unknown) => null));
vi.mock("@/components/admin/growth/GrowthCard", () => ({ GrowthCard: (props: unknown) => growth(props) }));

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

  it("keeps the Activity tab to the log, bounded by the range, with no summary or range of its own", async () => {
    window.history.replaceState({}, "", "/admin?range=7d");
    renderPage();
    fireEvent.click(screen.getByTestId("tab-activity"));

    const panel = await screen.findByTestId("panel-activity");
    expect(within(panel).getByTestId("card-platform-activity")).toHaveTextContent(/last 7 days/i);
    expect(within(panel).queryByTestId("card-activity-summary")).toBeNull();
    expect(within(panel).queryByTestId("time-range-selector")).toBeNull();
  });

  it("counts every record of the range in the Overview's summary, however many backend pages", async () => {
    const stamp = (i: number) => new Date(Date.now() - i * 60_000).toISOString();
    const record = (i: number) => ({
      private_id: i,
      pubkey: "b".repeat(64),
      status: "success",
      created_at: stamp(i),
      updated_at: stamp(i),
    });
    // The backend pages at 100 rows: 4,856 records in the last 7 days span 49 pages.
    const TOTAL = 4856;
    api.getAdminActivity.mockImplementation(async ({ page = 1 }: { page?: number }) => {
      const from = (page - 1) * 100;
      const items = Array.from({ length: Math.max(0, Math.min(100, TOTAL - from)) }, (_, i) => record(from + i));
      return { items, total: TOTAL, pages: 49 };
    });
    window.history.replaceState({}, "", "/admin?range=7d");
    renderPage();

    const panel = await screen.findByTestId("panel-overview");
    const summary = within(panel).getByTestId("card-activity-summary");
    await waitFor(() => expect(within(summary).getByTestId("summary-total")).toHaveTextContent("4,856"), {
      timeout: 4000,
    });
    expect(within(summary).getByTestId("summary-success")).toHaveTextContent("4,856");
  });

  it("keeps the Users directory whole whatever the range, with no range of its own", async () => {
    window.history.replaceState({}, "", "/admin?range=1h");
    renderPage();
    fireEvent.click(screen.getByTestId("tab-users"));

    await screen.findByTestId("panel-users");
    // The Overview's user figures follow the range; the directory lists everyone.
    await waitFor(() =>
      expect(api.getAdminUsers).toHaveBeenCalledWith(expect.objectContaining({ days: 1, size: 100 })),
    );
    await waitFor(() =>
      expect(api.getAdminUsers).toHaveBeenCalledWith(expect.objectContaining({ days: 9999, size: 25 })),
    );
    expect(screen.queryByTestId("select-days-filter")).toBeNull();
  });

  it("shows the header cards' state now, from every user, whatever the range", async () => {
    // 271 users, all scored, over three backend pages; the range is one hour.
    const TOTAL = 271;
    api.getAdminUsers.mockImplementation(async ({ page = 1, days }: { page?: number; days?: number }) => {
      if (days !== 9999) return { items: [], total: 0, pages: 1 };
      const from = (page - 1) * 100;
      const items = Array.from({ length: Math.max(0, Math.min(100, TOTAL - from)) }, (_, i) => ({
        pubkey: String(from + i).padStart(64, "0"),
        latest_status: "success",
        latest_ta_status: "success",
        times_calculated: 2,
        last_updated: new Date().toISOString(),
      }));
      return { items, total: TOTAL, pages: 3 };
    });
    window.history.replaceState({}, "", "/admin?range=1h");
    renderPage();

    await waitFor(() => expect(screen.getByTestId("kpi-scored-users")).toHaveTextContent("271 / 271"), {
      timeout: 4000,
    });
    expect(screen.getByTestId("kpi-assertions-published")).toHaveTextContent("271 / 271");
    expect(screen.getByTestId("kpi-total-calcs")).toHaveTextContent("542");
  });

  it("reads success rate, failed count and queue depth off every user's latest run", async () => {
    // Ten users: eight succeeded, one failed, one still waiting.
    const statuses = [...Array(8).fill("success"), "failed", "waiting"];
    api.getAdminUsers.mockImplementation(async ({ days }: { days?: number }) => {
      if (days !== 9999) return { items: [], total: 0, pages: 1 };
      const items = statuses.map((latest_status, i) => ({
        pubkey: String(i).padStart(64, "0"),
        latest_status,
        latest_ta_status: latest_status,
        times_calculated: 1,
        last_updated: new Date().toISOString(),
      }));
      return { items, total: items.length, pages: 1 };
    });
    renderPage();

    await waitFor(() => expect(screen.getByTestId("kpi-success-rate")).toHaveTextContent("80%"));
    expect(screen.getByTestId("kpi-failed-count")).toHaveTextContent("1");
    expect(screen.getByTestId("kpi-queue-depth")).toHaveTextContent("1");
  });

  it("compares the range with the period before it", async () => {
    // Six records in the last 24 hours, four in the 24 hours before that.
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    const ages = [1, 2, 3, 4, 5, 6, 30, 31, 32, 33];
    api.getAdminActivity.mockImplementation(async () => ({
      items: ages.map((h, i) => ({
        private_id: i,
        pubkey: "b".repeat(64),
        status: "success",
        created_at: hoursAgo(h),
        updated_at: hoursAgo(h),
      })),
      total: ages.length,
      pages: 1,
    }));
    api.getAdminUsers.mockResolvedValue({
      items: [{ pubkey: "c".repeat(64), latest_status: "success", times_calculated: 10, last_updated: hoursAgo(1) }],
      total: 1,
      pages: 1,
    });
    window.history.replaceState({}, "", "/admin?range=24h");
    renderPage();

    const panel = await screen.findByTestId("panel-overview");
    await waitFor(() => expect(within(panel).getByTestId("summary-total")).toHaveTextContent("6"));
    const deltas = within(panel)
      .getAllByText("vs prior 24h")
      .map((label) => label.parentElement?.textContent?.replace(/\s+/g, " ").trim());
    expect(deltas).toContain("+2 vs prior 24h");
  });

  it("gives the Growth tab the year's runs and the dashboard's range", async () => {
    window.history.replaceState({}, "", "/admin?range=7d");
    renderPage();
    fireEvent.click(screen.getByTestId("tab-growth"));

    await screen.findByTestId("panel-growth");
    await waitFor(() =>
      expect(api.getAdminActivity).toHaveBeenCalledWith(expect.objectContaining({ days: 365, page: 1 })),
    );
    await waitFor(() => expect(growth).toHaveBeenLastCalledWith(expect.objectContaining({ range: "7d" })));
  });

  it("lists every failed user when the Failed Count card is clicked, not only the page on screen", async () => {
    // 271 users; the ten who failed are the last ten, on the directory's eleventh page.
    const TOTAL = 271;
    const user = (i: number) => ({
      pubkey: String(i).padStart(64, "0"),
      latest_status: i >= TOTAL - 10 ? "failed" : "success",
      latest_ta_status: "success",
      times_calculated: 1,
      last_updated: new Date().toISOString(),
    });
    api.getAdminUsers.mockImplementation(async ({ page = 1, size = 25 }: { page?: number; size?: number }) => {
      const from = (page - 1) * size;
      const items = Array.from({ length: Math.max(0, Math.min(size, TOTAL - from)) }, (_, i) => user(from + i));
      return { items, total: TOTAL, pages: Math.ceil(TOTAL / size) };
    });
    renderPage();
    await waitFor(() => expect(screen.getByTestId("kpi-failed-count")).toHaveTextContent("10"), { timeout: 4000 });

    fireEvent.click(screen.getByTestId("kpi-failed-count"));

    const panel = await screen.findByTestId("panel-users");
    await waitFor(() => expect(within(panel).getAllByTestId(/^row-user-\d+$/)).toHaveLength(10));
    expect(within(panel).queryByText(/no users match/i)).toBeNull();
  });

  it("takes a custom 'last N days' from the header", async () => {
    renderPage();
    await waitFor(() => expect(api.getAdminActivity).toHaveBeenCalled());

    fireEvent.click(screen.getByTestId("button-range-custom"));
    fireEvent.change(screen.getByTestId("input-range-days"), { target: { value: "14" } });
    fireEvent.submit(screen.getByTestId("form-range-days"));

    await waitFor(() => expect(api.getAdminUsers).toHaveBeenLastCalledWith(expect.objectContaining({ days: 14 })));
    expect(new URLSearchParams(window.location.search).get("range")).toBe("14d");
    expect(screen.getByTestId("system-state-note")).toHaveTextContent(/last 14 days/i);
  });
});
